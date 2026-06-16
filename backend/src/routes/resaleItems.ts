import { Router, Response } from 'express';
import { db } from '../db/init';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createAccessToken, filenameFromPath, TOKEN_TTL_MS } from '../services/uploadAccess';

export const resaleItemsRouter = Router();

type SourceType = 'user_idle' | 'merchant_clearance';

interface ResaleItemRow {
  id: number;
  owner_user_id: number | null;
  merchant_id: number | null;
  source_type: SourceType;
  title: string;
  description: string | null;
  image_url: string | null;
  season_tags: string | null;
  occasion_tags: string | null;
  gender_tags: string | null;
  age_tags: string | null;
  price: number;
  currency: string;
  slot_fee: number;
  slot_fee_paid: number;
  status: string;
  created_at: string;
  updated_at: string;
}

function withImageAccess(row: ResaleItemRow): ResaleItemRow & { image_access_url?: string } {
  const imageUrl = row.image_url;
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return row;
  const filename = filenameFromPath(imageUrl);
  const token = createAccessToken(filename, TOKEN_TTL_MS);
  return {
    ...row,
    image_access_url: `/api/upload/access/${encodeURIComponent(filename)}?token=${token}`,
  };
}

function normalizeTags(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parts = value.split(',').map((t) => t.trim()).filter(Boolean);
    return parts.length ? parts.join(',') : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((t) => String(t).trim()).filter(Boolean);
    return parts.length ? parts.join(',') : null;
  }
  return null;
}

// 发布闲置 / 过季衣物
resaleItemsRouter.post('/', requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const {
    title,
    description,
    image_url,
    season_tags,
    occasion_tags,
    gender_tags,
    age_tags,
    price,
    source_type,
    merchant_id,
  } = req.body || {};

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: '需要 title' });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return res.status(400).json({ error: '需要有效的 price' });
  }

  const src: SourceType = source_type === 'merchant_clearance' ? 'merchant_clearance' : 'user_idle';
  let ownerUserId: number | null = null;
  let merchantId: number | null = null;

  if (src === 'user_idle') {
    ownerUserId = userId;
  } else {
    // 简单校验商家 id，后续可接入更严格的角色判断
    const mid = Number(merchant_id);
    if (!Number.isInteger(mid) || mid <= 0) {
      return res.status(400).json({ error: '商家过季衣物需要有效的 merchant_id' });
    }
    const exists = db.prepare('SELECT id FROM merchants WHERE id = ?').get(mid) as { id: number } | undefined;
    if (!exists) {
      return res.status(400).json({ error: '商家不存在' });
    }
    merchantId = mid;
  }

  const season = normalizeTags(season_tags);
  const occasion = normalizeTags(occasion_tags);
  const gender = normalizeTags(gender_tags);
  const age = normalizeTags(age_tags);

  const slotFee = 2;
  const status = 'online';
  const now = new Date().toISOString();

  const stmt = db.prepare(
    `INSERT INTO resale_items
    (owner_user_id, merchant_id, source_type, title, description, image_url,
     season_tags, occasion_tags, gender_tags, age_tags,
     price, currency, slot_fee, slot_fee_paid, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', ?, 0, ?, ?, ?)`
  );

  const result = stmt.run(
    ownerUserId,
    merchantId,
    src,
    title,
    description ?? null,
    image_url ?? null,
    season,
    occasion,
    gender,
    age,
    priceNum,
    slotFee,
    status,
    now,
    now,
  );

  const row = db
    .prepare('SELECT * FROM resale_items WHERE id = ?')
    .get(result.lastInsertRowid) as ResaleItemRow | undefined;

  return res.status(201).json(row);
});

// 列表：支持按来源类型和简单标签筛选
resaleItemsRouter.get('/', (req, res) => {
  const { type, season, occasion, gender, age, price_segment } = req.query as {
    type?: string;
    season?: string;
    occasion?: string;
    gender?: string;
    age?: string;
    price_segment?: string;
  };

  const params: (string | number)[] = [];
  const where: string[] = ["status = 'online'"];

  if (type === 'user_idle') {
    where.push('source_type = ?');
    params.push('user_idle');
  } else if (type === 'merchant_clearance') {
    where.push('source_type = ?');
    params.push('merchant_clearance');
  }

  if (season) {
    where.push('season_tags LIKE ?');
    params.push(`%${season}%`);
  }
  if (occasion) {
    where.push('occasion_tags LIKE ?');
    params.push(`%${occasion}%`);
  }
  if (gender) {
    where.push('gender_tags LIKE ?');
    params.push(`%${gender}%`);
  }
  if (age) {
    where.push('age_tags LIKE ?');
    params.push(`%${age}%`);
  }

  if (price_segment) {
    switch (price_segment) {
      case '0-200':
        where.push('price >= ? AND price < ?');
        params.push(0, 200);
        break;
      case '200-500':
        where.push('price >= ? AND price < ?');
        params.push(200, 500);
        break;
      case '500-1000':
        where.push('price >= ? AND price < ?');
        params.push(500, 1000);
        break;
      case '1000-10000':
        where.push('price >= ? AND price < ?');
        params.push(1000, 10000);
        break;
      case 'luxury':
        where.push('price >= ?');
        params.push(10000);
        break;
      default:
        break;
    }
  }

  const sql = `SELECT * FROM resale_items${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`;
  const rows = db.prepare(sql).all(...params) as ResaleItemRow[];
  return res.json(rows.map(withImageAccess));
});

// 详情
resaleItemsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '无效的 id' });
  }
  const row = db.prepare('SELECT * FROM resale_items WHERE id = ?').get(id) as ResaleItemRow | undefined;
  if (!row) return res.status(404).json({ error: '记录不存在' });
  return res.json(withImageAccess(row));
});

// 更新基础信息（仅发布者或商家）
resaleItemsRouter.put('/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '无效的 id' });
  }
  const existing = db
    .prepare('SELECT * FROM resale_items WHERE id = ?')
    .get(id) as ResaleItemRow | undefined;
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  const userId = req.user!.userId;
  const isOwner = existing.owner_user_id === userId;

  let isMerchantOwner = false;
  if (existing.merchant_id != null) {
    // 目前没有严格的商家账号绑定逻辑，这里只检查存在 merchant_id
    isMerchantOwner = true;
  }

  if (!isOwner && !isMerchantOwner) {
    return res.status(403).json({ error: '无权修改该记录' });
  }

  const {
    title,
    description,
    image_url,
    season_tags,
    occasion_tags,
    gender_tags,
    age_tags,
    price,
  } = req.body || {};

  const newTitle = title !== undefined ? title : existing.title;
  if (!newTitle || typeof newTitle !== 'string') {
    return res.status(400).json({ error: '需要有效的 title' });
  }

  const newPrice = price !== undefined ? Number(price) : existing.price;
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return res.status(400).json({ error: '需要有效的 price' });
  }

  const newSeason = season_tags !== undefined ? normalizeTags(season_tags) : existing.season_tags;
  const newOccasion = occasion_tags !== undefined ? normalizeTags(occasion_tags) : existing.occasion_tags;
  const newGender = gender_tags !== undefined ? normalizeTags(gender_tags) : existing.gender_tags;
  const newAge = age_tags !== undefined ? normalizeTags(age_tags) : existing.age_tags;

  const now = new Date().toISOString();

  db.prepare(
    `UPDATE resale_items
     SET title = ?, description = ?, image_url = ?, season_tags = ?, occasion_tags = ?, gender_tags = ?, age_tags = ?, price = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    newTitle,
    description !== undefined ? description : existing.description,
    image_url !== undefined ? image_url : existing.image_url,
    newSeason,
    newOccasion,
    newGender,
    newAge,
    newPrice,
    now,
    id,
  );

  const updated = db.prepare('SELECT * FROM resale_items WHERE id = ?').get(id) as ResaleItemRow | undefined;
  return res.json(updated ? withImageAccess(updated) : updated);
});

// 更新状态：offline / sold
resaleItemsRouter.put('/:id/status', requireAuth, (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '无效的 id' });
  }
  const existing = db
    .prepare('SELECT * FROM resale_items WHERE id = ?')
    .get(id) as ResaleItemRow | undefined;
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  const userId = req.user!.userId;
  const isOwner = existing.owner_user_id === userId;
  let isMerchantOwner = false;
  if (existing.merchant_id != null) {
    isMerchantOwner = true;
  }
  if (!isOwner && !isMerchantOwner) {
    return res.status(403).json({ error: '无权修改状态' });
  }

  const { status } = req.body || {};
  if (status !== 'offline' && status !== 'sold' && status !== 'online') {
    return res.status(400).json({ error: 'status 需要为 online/offline/sold' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE resale_items SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
  const updated = db.prepare('SELECT * FROM resale_items WHERE id = ?').get(id) as ResaleItemRow | undefined;
  return res.json(updated ? withImageAccess(updated) : updated);
});

