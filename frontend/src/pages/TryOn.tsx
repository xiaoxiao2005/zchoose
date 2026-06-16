import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TryOnGamePanel from '../components/TryOnGames';
import { readTryonPersonalInfoConsent } from '../components/TryOnPersonalInfoConsent';
import { checkImageQuality } from '../utils/imageQuality';
import './TryOn.css';

const WATERMARK_TEXT = 'zchoose';
const TRYON_OCCASION_TAGS = ['', '通勤', '约会', '日常', '运动'] as const;
const TRYON_AGE_TAGS = ['', '18-24', '25-29', '30-35', '35-50', '50+'] as const;

/**
 * 将图片（URL 或 data URL）绘制到 canvas 并添加右上角 zchoose 水印，返回 PNG Blob
 */
async function imageWithWatermarkBlob(imageSrc: string): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = imageSrc.startsWith('data:') ? null : 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('图片加载失败'));
    el.src = imageSrc;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('不支持绘制');
  ctx.drawImage(img, 0, 0);
  ctx.font = `${Math.max(14, Math.round(w * 0.04))}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const pad = Math.max(8, Math.round(w * 0.02));
  const x = w - pad;
  const y = pad;
  ctx.strokeText(WATERMARK_TEXT, x, y);
  ctx.fillText(WATERMARK_TEXT, x, y);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png');
  });
}

interface Outfit {
  id: number;
  name: string;
  image_url?: string | null;
  unlocked?: boolean;
  need_points?: number;
}

interface WardrobeItem {
  id: number;
  name?: string | null;
  image_url: string;
}

interface OutfitPreviewCandidate {
  sourceType: 'outfit' | 'wardrobe';
  id: number;
  name: string;
  imageUrl: string;
}

export default function TryOn() {
  const [searchParams] = useSearchParams();
  const presetOutfitId = searchParams.get('outfitId');
  const presetWardrobeItemId = searchParams.get('wardrobeItemId');
  const { user, token, handleUnauthorized } = useAuth();

  const [gender, setGender] = useState<'女' | '男'>('女');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoDisplayUrl, setPhotoDisplayUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [sourceType, setSourceType] = useState<'outfit' | 'wardrobe'>('outfit');
  const [occasionTag, setOccasionTag] = useState<string>('');
  const [ageTag, setAgeTag] = useState<string>('');
  const [selectedWardrobeItemId, setSelectedWardrobeItemId] = useState<number | null>(null);
  const [wardrobeUploading, setWardrobeUploading] = useState(false);
  const [selectedOutfitId, setSelectedOutfitId] = useState<number | null>(
    presetOutfitId ? Number(presetOutfitId) : null
  );
  useEffect(() => {
    if (presetWardrobeItemId) setSourceType('wardrobe');
    if (presetWardrobeItemId) setSelectedWardrobeItemId(Number(presetWardrobeItemId));
    if (presetWardrobeItemId) setSelectedOutfitId(null);
  }, [presetWardrobeItemId]);
  const [viewMode, setViewMode] = useState<'form' | 'result'>('form');
  const [resultId, setResultId] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultHint, setResultHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [assessmentResult, setAssessmentResult] = useState<{ bmi: number; conclusion: string; recommendedSize: string; sizeSource?: 'merchant' | 'default' } | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [merchants, setMerchants] = useState<{ id: number; name: string }[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);
  /** 生成已完成但用户尚未点击查看，不自动跳转结果页 */
  const [resultReadyToView, setResultReadyToView] = useState(false);
  /** 生成等待倒计时（秒），改为 30 秒 */
  const [countdownRemaining, setCountdownRemaining] = useState(0);
  /** 《个保法》单独同意：人像与体型数据用于试衣 */
  const [tryonPiConsent, setTryonPiConsent] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<OutfitPreviewCandidate | null>(null);

  useEffect(() => {
    setTryonPiConsent(readTryonPersonalInfoConsent());
  }, []);

  useEffect(() => {
    fetch('/api/body-profile/merchants')
      .then((res) => res.json())
      .then((data) => {
        if (data?.merchants && Array.isArray(data.merchants)) setMerchants(data.merchants);
      })
      .catch(() => {});
  }, []);

  const loadWardrobeItems = async () => {
    if (!token) return;
    const res = await fetch('/api/wardrobe/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => []);
    setWardrobeItems(Array.isArray(data) ? data : []);
  };


  useEffect(() => {
    void loadWardrobeItems();
  }, [token]);

  // 衣库列表（用于选穿搭）：按性别 + 场合 + 年龄段筛选
  useEffect(() => {
    const params = new URLSearchParams();
    const tags = [gender, occasionTag, ageTag].filter(Boolean);
    if (tags.length > 0) params.set('tags', tags.join(','));
    if (user?.userId) params.set('userId', String(user.userId));
    fetch(`/api/outfits?${params}`)
      .then((res) => res.json())
      .then((data) => setOutfits(Array.isArray(data) ? data : []))
      .catch(() => setOutfits([]));
  }, [gender, occasionTag, ageTag, user?.userId]);

  // 切换性别时清空已选搭配（仅性别变化时，不包含首次进入）
  const prevGenderRef = useRef(gender);
  useEffect(() => {
    if (prevGenderRef.current !== gender) {
      prevGenderRef.current = gender;
      setSelectedOutfitId(null);
    }
  }, [gender]);

  // 试衣结果页：标记禁止截屏，供原生 WebView 设置 FLAG_SECURE 等；离开结果页时移除
  useEffect(() => {
    if (viewMode === 'result') {
      document.documentElement.setAttribute('data-tryon-no-screenshot', 'true');
    } else {
      document.documentElement.removeAttribute('data-tryon-no-screenshot');
    }
    return () => document.documentElement.removeAttribute('data-tryon-no-screenshot');
  }, [viewMode]);

  const selectedOutfit = selectedOutfitId ? outfits.find((o) => o.id === selectedOutfitId) : null;

  const resolveImageUrl = (imageUrl?: string | null) => {
    if (!imageUrl) return '';
    return imageUrl.startsWith('http') ? imageUrl : `${window.location.origin}${encodeURI(imageUrl)}`;
  };

  const openOutfitPreview = (candidate: OutfitPreviewCandidate) => {
    setPreviewCandidate(candidate);
  };

  const confirmOutfitPreview = () => {
    if (!previewCandidate) return;
    if (previewCandidate.sourceType === 'outfit') {
      setSourceType('outfit');
      setSelectedOutfitId(previewCandidate.id);
    } else {
      setSourceType('wardrobe');
      setSelectedWardrobeItemId(previewCandidate.id);
    }
    setPreviewCandidate(null);
  };

  // 生成中倒计时：30 秒
  useEffect(() => {
    if (!loading) {
      setCountdownRemaining(0);
      return;
    }
    setCountdownRemaining(30);
    const tid = setInterval(() => {
      setCountdownRemaining((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(tid);
  }, [loading]);

  const handleAssess = () => {
    if (!tryonPiConsent) {
      setError('请先在登录/注册时勾选同意试衣个人信息处理规则');
      return;
    }
    const h = Number(height);
    const w = Number(weight);
    if (!h || h < 100 || h > 250 || !w || w < 30 || w > 200) {
      setError('请先填写有效身高（100-250cm）和体重（30-200kg）');
      return;
    }
    setError('');
    setAssessing(true);
    setAssessmentResult(null);
    const params = new URLSearchParams({ height_cm: String(h), weight_kg: String(w), gender });
    if (selectedMerchantId != null) params.set('merchant_id', String(selectedMerchantId));
    fetch(`/api/body-profile/assess?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAssessmentResult({
          bmi: data.bmi,
          conclusion: data.conclusion,
          recommendedSize: data.recommendedSize,
          sizeSource: data.sizeSource,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : '评估失败'))
      .finally(() => setAssessing(false));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!tryonPiConsent) {
      setError('请先在登录/注册时勾选同意试衣个人信息处理规则');
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const blobUrl = URL.createObjectURL(file);
    setPhotoUrl(blobUrl);
    setPhotoDisplayUrl(blobUrl);
    setError('');
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return null;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('photo', photoFile);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/upload/photo', { method: 'POST', headers, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleUnauthorized(res)) {
          setError('登录已过期，请重新登录');
          return null;
        }
        throw new Error((data.error as string) || '上传失败');
      }
      if (data.photo_access_url) setPhotoDisplayUrl(data.photo_access_url);
      return data.photo_url ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!tryonPiConsent) {
      setError('请先在登录/注册时勾选同意试衣个人信息处理规则');
      return;
    }
    if (!user?.userId) {
      setError('请先登录');
      return;
    }
    if (!selectedOutfitId) {
      if (sourceType === 'outfit') {
        setError('请选择一套穿搭');
        return;
      }
    }
    if (sourceType === 'wardrobe' && !selectedWardrobeItemId) {
      setError('请选择一件我的衣物');
      return;
    }
    let url = photoUrl;
    if (photoFile && !url?.startsWith('http') && !url?.startsWith('/')) {
      const uploaded = await uploadPhoto();
      if (!uploaded) return;
      url = uploaded;
    } else if (photoUrl?.startsWith('blob:')) {
      const uploaded = await uploadPhoto();
      if (!uploaded) return;
      url = uploaded;
    } else if (!url) {
      setError('请上传头像照片');
      return;
    }
    setResultReadyToView(false);
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        userId: user.userId,
        photoUrl: url,
      };
      if (sourceType === 'outfit' && selectedOutfitId) body.outfitId = selectedOutfitId;
      if (sourceType === 'wardrobe' && selectedWardrobeItemId) body.wardrobeItemId = selectedWardrobeItemId;
      if (height) body.height_cm = Number(height);
      if (weight) body.weight_kg = Number(weight);
      body.model = 'fashn-vton';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/try-on/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: {
        resultId?: number;
        result_url?: string;
        front_url?: string;
        error?: string;
        hint?: string;
        suggestions?: string[];
      } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        if (!res.ok) throw new Error('服务器返回格式异常，请稍后重试');
      }
      if (!res.ok) {
        if (handleUnauthorized(res)) {
          setError('登录已过期，请重新登录');
          return;
        }
        const tips = Array.isArray(data.suggestions) && data.suggestions.length > 0
          ? `\n建议：\n- ${data.suggestions.join('\n- ')}`
          : '';
        throw new Error(((data.error as string) || '生成失败') + tips);
      }
      setResultId(data.resultId ?? null);
      setResultUrl((data as { result_url?: string }).result_url ?? data.front_url ?? null);
      setResultHint(data.hint ?? null);
      setResultReadyToView(true);
      setViewMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const resultPlaceholderSvg =
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect fill="#27272a" width="400" height="600"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-size="24" font-family="sans-serif">试衣效果图</text></svg>`
    )}`;

  const downloadResultImage = async (imageSrc: string) => {
    let noWatermark = false;
    if (user?.userId) {
      const recordRes = await fetch('/api/try-on/record-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId }),
      });
      const recordData = recordRes.ok ? await recordRes.json().catch(() => ({})) : null;
      if (recordRes.status === 403) {
        setError('今日免费下载次数已用完（5 次/天），明天再来吧');
        return;
      }
      if (recordRes.ok && recordData?.energyAdded) {
        setError('');
      }
      noWatermark = recordData?.noWatermark === true;
    }
    const filename = `试衣效果_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(' ', '_')}.png`;
    if (noWatermark) {
      if (imageSrc.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = imageSrc;
        a.download = filename;
        a.click();
        return;
      }
      const fullUrl = imageSrc.startsWith('http') ? imageSrc : `${window.location.origin}${imageSrc}`;
      try {
        const res = await fetch(fullUrl, { mode: 'cors' });
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objUrl);
      } catch {
        window.open(fullUrl, '_blank');
      }
      return;
    }
    try {
      const blob = await imageWithWatermarkBlob(imageSrc);
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch {
      if (imageSrc.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = imageSrc;
        a.download = filename;
        a.click();
        return;
      }
      const fullUrl = imageSrc.startsWith('http') ? imageSrc : `${window.location.origin}${imageSrc}`;
      try {
        const res = await fetch(fullUrl, { mode: 'cors' });
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objUrl);
      } catch {
        window.open(fullUrl, '_blank');
      }
    }
  };

  if (viewMode === 'result' && resultUrl !== null) {
    const src = resultUrl || resultPlaceholderSvg;
    const isPlaceholder = resultUrl.startsWith('data:image/svg+xml');
    return (
      <div className="tryon tryon--result tryon__result-no-screenshot">
        <h2 className="tryon__title">试衣结果</h2>
        {isPlaceholder && (
          <p className="tryon__result-placeholder-hint">
            {resultHint || '当前为占位图。如需真实试衣效果，请启动 tryon-service 并配置后端环境变量 TRYON_API_URL，或确保所选搭配有图片且试衣服务正常。'}
          </p>
        )}
        <div className="tryon__result-single tryon__result-single--with-watermark">
          <img src={src} alt="试衣效果" onError={(e) => { e.currentTarget.src = resultPlaceholderSvg; }} />
          <span className="tryon__watermark" aria-hidden="true">{WATERMARK_TEXT}</span>
        </div>

        {error && <p className="tryon__error tryon__error--result">{error}</p>}
        <div className="tryon__result-actions">
          <button type="button" className="tryon__btn tryon__btn--primary" onClick={() => downloadResultImage(src)}>
            下载图片
          </button>
          <button type="button" className="tryon__btn tryon__btn--secondary" onClick={() => { setViewMode('form'); }}>
            返回
          </button>
          <button type="button" className="tryon__btn" onClick={() => { setViewMode('form'); }}>
            再试一套
          </button>
        </div>
        <span className="tryon__hint">可点击「下载图片」保存到本地；分享到抖音可在「我的」- 抖音核销中操作</span>
      </div>
    );
  }

  const outfitImageUrl = selectedOutfit?.image_url ? resolveImageUrl(selectedOutfit.image_url) : null;

  return (
    <div className="tryon tryon--with-game">
      <div className="tryon__form">
      <h2 className="tryon__title">虚拟试衣</h2>

      <div className="tryon__tips">
        <p><strong>拍摄小贴士</strong></p>
        <p><strong>全身图效果最好。</strong>人物正面、光线均匀；头发、手及杂物尽量不遮挡衣服，摆好姿势后拍摄更稳。</p>
        <p>与 AI 模特姿势一致时，试衣效果更好。</p>
        <p className="tryon__tips-note">虚拟试衣不能完全替代真实穿着，仅供参考整体搭配感觉；最真实效果请以实物试穿为准。</p>
      </div>

      <section className={`tryon__section ${!tryonPiConsent ? 'tryon__section--locked' : ''}`} aria-disabled={!tryonPiConsent}>
        <h3>基本信息</h3>
        <p className="tryon__hint tryon__hint--small">可为本人或他人选穿搭，自由选择性别即可。</p>
        <label className="tryon__row">
          性别
          <select value={gender} onChange={(e) => setGender(e.target.value as '女' | '男')} disabled={!tryonPiConsent}>
            <option value="女">女</option>
            <option value="男">男</option>
          </select>
        </label>
        <div className="tryon__row">
          <label>身高 <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="cm" disabled={!tryonPiConsent} /> cm</label>
          <label>体重 <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="kg" disabled={!tryonPiConsent} /> kg</label>
        </div>
        <div className="tryon__assess-row">
          {merchants.length > 0 && (
            <label className="tryon__merchant-select">
              <span className="tryon__merchant-label">按商家尺码</span>
              <select value={selectedMerchantId ?? ''} onChange={(e) => setSelectedMerchantId(e.target.value ? Number(e.target.value) : null)} disabled={!tryonPiConsent}>
                <option value="">默认</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="tryon__btn tryon__btn--assess" onClick={handleAssess} disabled={assessing || !tryonPiConsent}>
            {assessing ? '评估中...' : '一键评估'}
          </button>
          {assessmentResult && (
            <div className="tryon__assess-result">
              <span className="tryon__assess-conclusion">体型：{assessmentResult.conclusion}</span>
              <span className="tryon__assess-size">推荐尺码：{assessmentResult.recommendedSize}</span>
              {assessmentResult.sizeSource === 'merchant' && merchants.length > 0 && selectedMerchantId != null && (
                <span className="tryon__assess-merchant">（{merchants.find((m) => m.id === selectedMerchantId)?.name ?? '商家'}尺码表）</span>
              )}
              <span className="tryon__assess-bmi">BMI：{assessmentResult.bmi}（健康范围 18.5～24）</span>
            </div>
          )}
        </div>
        <p className="tryon__hint">以上可从「我的」预填，用于生成更贴合的结果</p>
      </section>

      <section className={`tryon__section ${!tryonPiConsent ? 'tryon__section--locked' : ''}`}>
        <h3>上传照片</h3>
        <p className="tryon__hint tryon__hint--small">全身图或半身图</p>
        <label className={`tryon__upload ${!tryonPiConsent ? 'tryon__upload--disabled' : ''}`}>
          <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={!tryonPiConsent} />
          {photoUrl ? (
            <img src={photoDisplayUrl || photoUrl} alt="已选" className="tryon__preview" />
          ) : (
            <span className="tryon__upload-placeholder">点击上传或拖拽</span>
          )}
        </label>
      </section>

      <section className="tryon__section">
        <h3>生成模型</h3>
        <p className="tryon__model-name">FASHN VTON v1.5</p>
      </section>

      <section className={`tryon__section ${!tryonPiConsent ? 'tryon__section--locked' : ''}`}>
        <h3>选择穿搭</h3>
        <div className="tryon__row">
          <label>
            场合
            <select value={occasionTag} onChange={(e) => setOccasionTag(e.target.value)} disabled={!tryonPiConsent}>
              {TRYON_OCCASION_TAGS.map((t) => (
                <option key={t || 'all-occasion'} value={t}>{t || '全部'}</option>
              ))}
            </select>
          </label>
          <label>
            年龄段
            <select value={ageTag} onChange={(e) => setAgeTag(e.target.value)} disabled={!tryonPiConsent}>
              {TRYON_AGE_TAGS.map((t) => (
                <option key={t || 'all-age'} value={t}>{t || '全部'}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="tryon__bg-options">
          <label className="tryon__bg-option">
            <input
              type="radio"
              name="sourceType"
              checked={sourceType === 'outfit'}
              onChange={() => setSourceType('outfit')}
              disabled={!tryonPiConsent}
            />
            <span>官方衣库</span>
          </label>
          <label className="tryon__bg-option">
            <input
              type="radio"
              name="sourceType"
              checked={sourceType === 'wardrobe'}
              onChange={() => setSourceType('wardrobe')}
              disabled={!tryonPiConsent}
            />
            <span>我的衣库</span>
          </label>
        </div>
        <div className="tryon__outfit-pick">
          {sourceType === 'outfit' ? (
            <>
              <p className="tryon__hint tryon__hint--small">请选择一套</p>
              <div className="tryon__outfit-list">
                {outfits.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`tryon__outfit-row ${selectedOutfitId === o.id ? 'tryon__outfit-row--selected' : ''}`}
                    disabled={!tryonPiConsent}
                    onClick={() => tryonPiConsent && openOutfitPreview({
                      sourceType: 'outfit',
                      id: o.id,
                      name: o.name,
                      imageUrl: resolveImageUrl(o.image_url),
                    })}
                  >
                    <span
                      className="tryon__outfit-row-icon"
                      style={{ backgroundImage: o.image_url ? `url("${resolveImageUrl(o.image_url)}")` : undefined }}
                    />
                    <span className="tryon__outfit-row-name">
                      {o.name}
                      {o.need_points && !o.unlocked ? ` (需${o.need_points}积分)` : ''}
                    </span>
                  </button>
                ))}
              </div>
              {selectedOutfit && <p className="tryon__outfit-name">已选：{selectedOutfit.name}</p>}
            </>
          ) : (
            <>
              <div className="tryon__actions">
                <label className="tryon__btn tryon__btn--secondary">
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={!tryonPiConsent || wardrobeUploading}
                    onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!token) {
                      setError('登录状态已失效，请重新登录后再上传我的衣物');
                      return;
                    }
                      setWardrobeUploading(true);
                      setError('');
                      try {
                      const quality = await checkImageQuality(file);
                      if (!quality.pass) {
                        throw new Error(`图片质量较低（评分 ${quality.score}/100）。${quality.suggestion}`);
                      }
                        const form = new FormData();
                        form.append('photo', file);
                        const uploadRes = await fetch('/api/upload/photo', {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                          body: form,
                        });
                        const uploadData = await uploadRes.json().catch(() => ({}));
                        if (!uploadRes.ok || !uploadData.photo_url) {
                          throw new Error(uploadData.error || '上传失败');
                        }
                        const saveRes = await fetch('/api/wardrobe', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            name: file.name.replace(/\.[^.]+$/, ''),
                            image_url: uploadData.photo_url,
                          }),
                        });
                        const saveData = await saveRes.json().catch(() => ({}));
                        if (!saveRes.ok) throw new Error(saveData.error || '保存到我的衣库失败');
                        await loadWardrobeItems();
                        if (saveData?.id) setSelectedWardrobeItemId(Number(saveData.id));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '上传失败');
                      } finally {
                        setWardrobeUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  {wardrobeUploading ? '上传中...' : '上传到我的衣库'}
                </label>
              </div>
              <div className="tryon__outfit-list">
                {wardrobeItems.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`tryon__outfit-row ${selectedWardrobeItemId === w.id ? 'tryon__outfit-row--selected' : ''}`}
                    disabled={!tryonPiConsent}
                    onClick={() => tryonPiConsent && openOutfitPreview({
                      sourceType: 'wardrobe',
                      id: w.id,
                      name: w.name || `我的衣物-${w.id}`,
                      imageUrl: resolveImageUrl(w.image_url),
                    })}
                  >
                    <span
                      className="tryon__outfit-row-icon"
                      style={{ backgroundImage: `url("${resolveImageUrl(w.image_url)}")` }}
                    />
                    <span className="tryon__outfit-row-name">{w.name || `我的衣物-${w.id}`}</span>
                  </button>
                ))}
              </div>
              {wardrobeItems.length === 0 && <p className="tryon__hint">暂无我的衣物，先上传一张服装图</p>}
            </>
          )}
        </div>
      </section>

      {error && <p className="tryon__error">{error}</p>}

      <section className="tryon__section tryon__actions">
        <button
          type="button"
          className="tryon__btn tryon__btn--primary"
          disabled={loading || uploading || !tryonPiConsent}
          onClick={handleGenerate}
        >
          {loading ? '生成中...' : uploading ? '上传中...' : '生成'}
        </button>
        {resultUrl != null && (
          <button
            type="button"
            className="tryon__btn tryon__btn--secondary"
            onClick={() => {
              setViewMode('result');
              setResultReadyToView(false);
            }}
          >
            查看
          </button>
        )}
      </section>
      </div>
      <aside className="tryon__game-panel">
        <TryOnGamePanel
          outfitImageUrl={outfitImageUrl}
          isGenerating={loading}
          countdownRemaining={countdownRemaining}
          resultReadyToView={resultReadyToView}
          onViewResult={() => {
            setViewMode('result');
            setResultReadyToView(false);
          }}
        />
      </aside>
      {previewCandidate && (
        <div className="tryon__preview-modal" role="dialog" aria-modal="true" aria-label="试衣搭配预览">
          <div className="tryon__preview-modal-content">
            <h3 className="tryon__preview-modal-title">预览搭配</h3>
            <img src={previewCandidate.imageUrl} alt={previewCandidate.name} className="tryon__preview-modal-image" />
            <p className="tryon__preview-modal-name">{previewCandidate.name}</p>
            <div className="tryon__preview-modal-actions">
              <button type="button" className="tryon__btn tryon__btn--primary" onClick={confirmOutfitPreview}>
                确定
              </button>
              <button type="button" className="tryon__btn tryon__btn--secondary" onClick={() => setPreviewCandidate(null)}>
                返回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
