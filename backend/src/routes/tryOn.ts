import fs from 'fs';
import { Router } from 'express';
import path from 'path';
import { Jimp } from 'jimp';
import { db } from '../db/init';
import { getPresetBackgroundDir, PRESET_BG_DIR_NAME } from '../imagesPath';
import { buildTryOnPrompt } from '../services/prompt';
import { generateTryOnThreeViews } from '../services/tryOnGenerate';
import { isUnlocked } from './unlocks';
import { addOutfitRecord } from '../services/outfitRecords';
import { getTryonRemainingToday, consumeTryonQuota, consumeDownloadQuota } from '../services/dailyQuota';
import { addEnergy } from '../services/energy';
import { createTryOnAccessToken } from './upload';
import { filenameFromPath, isOwnerOfUpload } from '../services/uploadAccess';
import { UPLOAD_DIR } from '../services/uploadAccess';

export const tryOnRouter = Router();

/** 每日试衣免费次数 */
const TRYON_FREE_PER_DAY = 5;

const PRESET_BG_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

tryOnRouter.get('/preset-backgrounds', (req, res) => {
  const dir = getPresetBackgroundDir();
  let list: { id: string; name: string; imageUrl: string }[] = [];
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const files = fs.readdirSync(dir).filter((f) => PRESET_BG_EXT.test(f));
      const baseUrl = '/images/' + PRESET_BG_DIR_NAME;
      list = files.map((f) => {
        const id = f.replace(/\.[^.]+$/, '');
        return {
          id: id.replace(/\s+/g, '-'),
          name: id,
          imageUrl: `${baseUrl}/${encodeURIComponent(f)}`,
        };
      });
    }
  } catch (_) {}
  res.json({ list });
});

/**
 * 试衣生成：根据用户人物照 + 身高体重体型 + 所选搭配，生成一张试衣图并落库返回。
 * 每日 5 次免费（等价 50 积分/天，生成一次扣 10 分），需登录。
 * 若配置 TRYON_API_URL 则调用外部生成 API，否则返回占位图。
 */
tryOnRouter.post('/generate', async (req, res) => {
  try {
    const { userId, outfitId, wardrobeItemId, photoUrl } = req.body;
    if (!userId || !photoUrl || (!outfitId && !wardrobeItemId)) {
      return res.status(400).json({ error: '需要 userId, photoUrl，且 outfitId 与 wardrobeItemId 至少传一个' });
    }
    const uid = Number(userId);
    const oid = outfitId ? Number(outfitId) : null;
    const wid = wardrobeItemId ? Number(wardrobeItemId) : null;
    const remaining = getTryonRemainingToday(uid);
    if (remaining <= 0) {
      return res.status(403).json({
        error: '今日免费试衣次数已用完',
        tryonRemaining: 0,
        tryonLimit: TRYON_FREE_PER_DAY,
      });
    }
    const outfit = oid ? db.prepare('SELECT id, name, need_points, image_url FROM outfits WHERE id = ?').get(oid) as
      | { need_points: number; image_url: string | null }
      | undefined : undefined;
    const wardrobeItem = wid ? db.prepare(
      'SELECT id, user_id, name, image_url FROM user_wardrobe_items WHERE id = ?'
    ).get(wid) as { id: number; user_id: number; name: string | null; image_url: string } | undefined : undefined;
    if (!outfit && !wardrobeItem) return res.status(404).json({ error: '搭配或我的衣物不存在' });
    if (outfit && outfit.need_points > 0 && oid && !isUnlocked(uid, oid)) {
      return res.status(403).json({ error: '请先使用积分解锁该搭配', needPoints: outfit.need_points });
    }
    if (wardrobeItem && wardrobeItem.user_id !== uid) {
      return res.status(403).json({ error: '无权使用该衣物试穿' });
    }
    const { height_cm, weight_kg, body_type, extra_prompt, model } = req.body;
    const tryonModel = model === 'fashn-vton' ? 'fashn-vton' : 'fashn-vton';
    const override =
      [height_cm, weight_kg, body_type, extra_prompt].some((v) => v !== undefined)
        ? { height_cm, weight_kg, body_type, extra_prompt }
        : undefined;
    const promptResult = outfit && oid
      ? buildTryOnPrompt(uid, oid, override)
      : {
          fullPrompt: `人物试衣三视图，保持人物面部与身份一致，身材符合输入参数。搭配：${wardrobeItem?.name || '我的衣物'}。输出正面、侧面、背面三张图，风格统一、光线自然、符合身高体重与体型。`,
          height_cm: override?.height_cm ?? null,
          weight_kg: override?.weight_kg ?? null,
          bodyTypeLabel: override?.body_type ?? null,
          gender: null,
        };
    if (!promptResult) return res.status(404).json({ error: '搭配不存在' });

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    let personPhotoUrl: string;
    if (photoUrl.startsWith('http')) {
      personPhotoUrl = photoUrl;
    } else if (photoUrl.startsWith('/uploads/')) {
      const filename = filenameFromPath(photoUrl);
      if (!isOwnerOfUpload(uid, filename)) {
        return res.status(403).json({ error: '无权使用该照片试衣' });
      }
      const token = createTryOnAccessToken(filename);
      personPhotoUrl = `${baseUrl}/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
    } else {
      personPhotoUrl = `${baseUrl}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
    }
    const outfitImageRef = outfit?.image_url || wardrobeItem?.image_url || null;
    let outfitImageUrl: string | null = null;
    if (outfitImageRef) {
      if (outfitImageRef.startsWith('http')) {
        outfitImageUrl = outfitImageRef;
      } else if (outfitImageRef.startsWith('/uploads/')) {
        const filename = filenameFromPath(outfitImageRef);
        if (!isOwnerOfUpload(uid, filename)) {
          return res.status(403).json({ error: '无权使用该衣物图片试穿' });
        }
        const token = createTryOnAccessToken(filename);
        outfitImageUrl = `${baseUrl}/api/upload/access/${encodeURIComponent(filename)}?token=${token}`;
      } else {
        outfitImageUrl = `${baseUrl}${outfitImageRef.startsWith('/') ? '' : '/'}${outfitImageRef}`;
      }
    }

    const threeViews = await generateTryOnThreeViews({
      personPhotoUrl,
      outfitImageUrl,
      prompt: promptResult.fullPrompt,
      height_cm: promptResult.height_cm,
      weight_kg: promptResult.weight_kg,
      body_type_label: promptResult.bodyTypeLabel,
      gender: promptResult.gender,
      model: tryonModel,
    });

    const stmt = db.prepare(
      'INSERT INTO tryon_results (user_id, outfit_id, wardrobe_item_id, photo_url, front_url, side_url, back_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(uid, oid ?? 0, wid ?? null, photoUrl, threeViews.front_url, threeViews.side_url, threeViews.back_url);
    const resultId = Number(result.lastInsertRowid);
    consumeTryonQuota(uid);
    const { occasion, weatherTemp, weatherDesc } = req.body;
    if (oid) addOutfitRecord(uid, oid, { occasion, weatherTemp, weatherDesc });

    res.status(201).json({
      resultId,
      model: tryonModel,
      fullPrompt: promptResult.fullPrompt,
      result_url: threeViews.front_url,
      tryonRemaining: remaining - 1,
      tryonLimit: TRYON_FREE_PER_DAY,
      ...(threeViews.hint && { hint: threeViews.hint }),
    });
  } catch (e) {
    console.error('[try-on/generate]', e);
    const msg = e instanceof Error ? e.message : '试衣生成异常';
    res.status(500).json({
      error: msg,
      errorCode: 'TRYON_GENERATE_FAILED',
      suggestions: [
        '请重新上传更清晰、光线更均匀的衣物图',
        '让衣物主体尽量占画面 60% 以上，减少遮挡与反光',
        '若仍失败，可更换角度或改用纯色背景后重试',
      ],
    });
  }
});

/** 记录一次下载并发放时尚能量（每日 5 次免费，每次下载 +10 能量）；需登录。会员（买了积分）返回 noWatermark: true，前端下载不带水印 */
tryOnRouter.post('/record-download', (req, res) => {
  const { userId } = req.body;
  const uid = userId ? Number(userId) : null;
  if (!uid) return res.status(401).json({ error: '请先登录' });
  if (!consumeDownloadQuota(uid)) {
    return res.status(403).json({
      error: '今日免费下载次数已用完',
      downloadRemaining: 0,
      downloadLimit: 5,
    });
  }
  addEnergy(uid, 10);
  const row = db.prepare('SELECT is_member FROM users WHERE id = ?').get(uid) as { is_member: number } | undefined;
  const noWatermark = row?.is_member === 1;
  res.json({ ok: true, energyAdded: 10, noWatermark: !!noWatermark });
});

/** 可选：获取可用试衣模型列表（若配置了 TRYON_API_URL 则转发，否则返回默认） */
tryOnRouter.get('/models', async (req, res) => {
  const apiUrl = process.env.TRYON_API_URL;
  const base = apiUrl ? apiUrl.replace(/\/generate\/?$/, '') : '';
  const onlyFashn = [
    { id: 'fashn-vton', name: 'FASHN VTON v1.5', desc: '像素空间生成，支持云 API 或自建' },
  ];
  if (base) {
    try {
      const r = await fetch(`${base}/models`);
      if (r.ok) {
        const data = (await r.json()) as { models?: { id: string; name: string; desc: string }[] };
        const list = Array.isArray(data?.models) ? data.models.filter((m) => m.id === 'fashn-vton') : onlyFashn;
        return res.json({ models: list.length > 0 ? list : onlyFashn });
      }
    } catch (_) {}
  }
  res.json({ models: onlyFashn });
});

/** 查询某次试衣生成结果（用于展示三视图、或后续美化） */
tryOnRouter.get('/results/:resultId', (req, res) => {
  const resultId = Number(req.params.resultId);
  const row = db.prepare('SELECT * FROM tryon_results WHERE id = ?').get(resultId);
  if (!row) return res.status(404).json({ error: '生成结果不存在' });
  res.json(row);
});

/**
 * 替换背景：试衣图 + 背景图融合为一张图。
 * Body: { resultId, backgroundUrl? }。未传 backgroundUrl 或暂未实现融合时，直接返回试衣图。
 * 后续可接入抠图（如 rembg）+ 合成服务。
 */
tryOnRouter.post('/replace-background', (req, res) => {
  const { resultId, backgroundUrl } = req.body || {};
  const rid = Number(resultId);
  if (!rid) return res.status(400).json({ error: '需要 resultId' });
  const row = db.prepare('SELECT id, front_url FROM tryon_results WHERE id = ?').get(rid) as { front_url: string } | undefined;
  if (!row) return res.status(404).json({ error: '生成结果不存在' });
  if (!backgroundUrl || typeof backgroundUrl !== 'string') {
    return res.status(400).json({ error: '请选择背景图后再生成融合图' });
  }

  const buildAbsUrl = (u: string) => {
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    if (u.startsWith('http')) {
      try {
        const parsed = new URL(u);
        // 前端传来的 http://localhost:5173/api/... 对后端进程不可直接保证可读，
        // 统一回源到后端地址读取静态与受保护资源。
        if (
          parsed.pathname.startsWith('/api/') ||
          parsed.pathname.startsWith('/uploads/') ||
          parsed.pathname.startsWith('/images/')
        ) {
          return `${baseUrl}${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // ignore url parse
      }
      return u;
    }
    return `${baseUrl}${u.startsWith('/') ? '' : '/'}${u}`;
  };

  const run = async () => {
    const frontAbs = buildAbsUrl(row.front_url);
    const frontRes = await fetch(frontAbs);
    if (!frontRes.ok) throw new Error('读取试衣图失败');
    const frontBuf = await frontRes.arrayBuffer();

    const readMaybeDataUrl = async (ref: string): Promise<Buffer> => {
      if (ref.startsWith('data:')) {
        const idx = ref.indexOf(',');
        if (idx <= 0) throw new Error('背景 data URL 无效');
        const meta = ref.slice(0, idx);
        const payload = ref.slice(idx + 1);
        if (meta.includes(';base64')) return Buffer.from(payload, 'base64');
        return Buffer.from(decodeURIComponent(payload), 'utf8');
      }
      if (ref.startsWith('blob:')) {
        throw new Error('背景地址为本地 blob，无法在后端读取，请重新上传背景图');
      }
      const normalized = buildAbsUrl(ref);
      let res = await fetch(normalized);
      if (!res.ok && normalized !== ref) {
        // 回退：若改写到后端失败，再尝试原始地址
        res = await fetch(ref);
      }
      if (!res.ok) throw new Error(`读取背景图失败(${res.status})`);
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    };
    const bgBuf = await readMaybeDataUrl(backgroundUrl);
    const front = await Jimp.read(Buffer.from(frontBuf));
    const bg = await Jimp.read(bgBuf);

    // 轻量抠图近似：以人物常见区域（中部偏下）做软蒙版，让背景替换效果更明显
    bg.cover({ w: front.bitmap.width, h: front.bitmap.height });
    const w = front.bitmap.width;
    const h = front.bitmap.height;
    const cx = w * 0.5;
    const cy = h * 0.56;
    const rx = w * 0.33;
    const ry = h * 0.42;
    const edge = 0.18; // 软边过渡

    const fg = front.clone();
    fg.scan(0, 0, w, h, function (_x, _y, idx) {
      const x = (_x - cx) / rx;
      const y = (_y - cy) / ry;
      const d = Math.sqrt(x * x + y * y);
      const t = Math.max(0, Math.min(1, (d - (1 - edge)) / edge));
      const softness = 1 - t; // 椭圆内 1，边缘渐变到 0
      this.bitmap.data[idx + 3] = Math.round(this.bitmap.data[idx + 3] * softness);
    });

    // 背景轻微压暗，前景主体更突出
    bg.brightness(-0.06);
    bg.composite(fg, 0, 0);

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const outName = `merged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const outPath = path.join(UPLOAD_DIR, outName);
    await bg.write(outPath);
    res.json({ image_url: `/uploads/${outName}` });
  };

  run().catch((e) => {
    console.error('[try-on/replace-background]', e);
    res.status(500).json({ error: '融合失败，请重试' });
  });
});

/**
 * 后期：对某次生成结果进行美化（磨皮、调色等）。
 * 当前为占位，后续接入你的美化服务后在此实现。
 */
tryOnRouter.post('/:resultId/beautify', (req, res) => {
  const resultId = Number(req.params.resultId);
  const { type } = req.body || {}; // 如 'skin_smooth' | 'color_tune'
  const row = db.prepare('SELECT id, front_url, side_url, back_url FROM tryon_results WHERE id = ?').get(resultId);
  if (!row) return res.status(404).json({ error: '生成结果不存在' });
  res.status(501).json({
    error: '美化功能待实现',
    hint: '可在此调用图像处理或 AI 修图 API，将新图存库或对象存储后返回新 URL',
    resultId,
    type: type || 'skin_smooth',
  });
});

