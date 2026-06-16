import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ResalePublish.css';

const SLOT_FEE_YUAN = 2;

const SEASON_OPTIONS = ['春', '夏', '秋', '冬'];
const OCCASION_OPTIONS = ['日常', '通勤', '约会', '运动'];
const GENDER_OPTIONS = ['男', '女'];
const AGE_OPTIONS = ['少年', '青年', '中年', '老年'];

type PublishType = 'user_idle' | 'merchant_clearance';

interface Merchant {
  id: number;
  name: string;
}

export default function ResalePublish() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const typeParam = searchParams.get('type') || 'user_idle';
  const publishType: PublishType =
    typeParam === 'merchant_clearance' ? 'merchant_clearance' : 'user_idle';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [seasonTags, setSeasonTags] = useState<string[]>([]);
  const [occasionTags, setOccasionTags] = useState<string[]>([]);
  const [genderTags, setGenderTags] = useState<string[]>([]);
  const [ageTags, setAgeTags] = useState<string[]>([]);
  const [price, setPrice] = useState('');
  const [merchantId, setMerchantId] = useState<string>('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (publishType === 'merchant_clearance') {
      fetch('/api/body-profile/merchants')
        .then((res) => res.json())
        .then((data) => setMerchants(Array.isArray(data?.merchants) ? data.merchants : []))
        .catch(() => setMerchants([]));
    }
  }, [publishType]);

  const toggleTag = (
    arr: string[],
    setter: (v: string[]) => void,
    tag: string,
  ) => {
    if (arr.includes(tag)) {
      setter(arr.filter((t) => t !== tag));
    } else {
      setter([...arr, tag]);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user?.userId || !token) {
      setError('请先登录后再发布');
      return;
    }
    const titleTrim = title.trim();
    if (!titleTrim) {
      setError('请填写衣物标题');
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('请填写有效的售卖价格');
      return;
    }
    if (publishType === 'merchant_clearance') {
      const mid = Number(merchantId);
      if (!Number.isInteger(mid) || mid <= 0) {
        setError('请选择商家');
        return;
      }
    }

    let finalImageUrl: string | null = imageUrl && !imageUrl.startsWith('blob:') ? imageUrl : null;
    if (imageFile && (!finalImageUrl || imageUrl?.startsWith('blob:'))) {
      const form = new FormData();
      form.append('photo', imageFile);
      try {
        const uploadRes = await fetch('/api/upload/photo', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setError(uploadData?.error || '图片上传失败');
          return;
        }
        finalImageUrl = uploadData.photo_url ?? null;
      } catch {
        setError('图片上传失败，请重试');
        return;
      }
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: titleTrim,
        description: description.trim() || undefined,
        image_url: finalImageUrl ?? undefined,
        season_tags: seasonTags.length ? seasonTags : undefined,
        occasion_tags: occasionTags.length ? occasionTags : undefined,
        gender_tags: genderTags.length ? genderTags : undefined,
        age_tags: ageTags.length ? ageTags : undefined,
        price: priceNum,
      };
      if (publishType === 'merchant_clearance') {
        body.source_type = 'merchant_clearance';
        body.merchant_id = Number(merchantId);
      }
      const res = await fetch('/api/resale-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || '发布失败');
        return;
      }
      navigate('/resale');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="resale-publish">
        <p className="resale-publish__login-hint">
          请先<Link to="/me">登录</Link>后再发布衣物。
        </p>
        <Link to="/resale" className="resale-publish__back">返回闲置市场</Link>
      </div>
    );
  }

  const isMerchant = publishType === 'merchant_clearance';

  return (
    <div className="resale-publish">
      <div className="resale-publish__header">
        <button
          type="button"
          className="resale-publish__back-btn"
          onClick={() => navigate('/resale')}
        >
          ← 返回闲置市场
        </button>
        <h2 className="resale-publish__title">
          {isMerchant ? '发布商家过季衣物' : '发布闲置衣物'}
        </h2>
      </div>

      <div className="resale-publish__fee">
        <strong>上传每套需支付 {SLOT_FEE_YUAN} 元占位费</strong>
        <span className="resale-publish__fee-note">（当前仅展示，暂不实际扣费）</span>
      </div>
      <p className="resale-publish__intro">
        下方标签分类与闲置市场筛选一致：少年/老年等对应童装与长辈款，通勤等场合不限于上班族，便于买家按同一套维度精准找到目标人群。
      </p>

      <form className="resale-publish__form" onSubmit={handleSubmit}>
        {isMerchant && (
          <label className="resale-publish__field">
            <span className="resale-publish__label">选择商家</span>
            <select
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              className="resale-publish__input"
              required={isMerchant}
            >
              <option value="">请选择</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="resale-publish__field">
          <span className="resale-publish__label">衣物标题</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="resale-publish__input"
            placeholder="例如：黑色连衣裙"
            maxLength={80}
            required
          />
        </label>

        <label className="resale-publish__field">
          <span className="resale-publish__label">描述（选填）</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="resale-publish__input resale-publish__textarea"
            placeholder="成色、尺码等"
            rows={3}
          />
        </label>

        <label className="resale-publish__field">
          <span className="resale-publish__label">衣物图片</span>
          <div className="resale-publish__upload-wrap">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageChange}
              className="resale-publish__file"
            />
            {imageUrl ? (
              <img src={imageUrl} alt="预览" className="resale-publish__preview" />
            ) : (
              <span className="resale-publish__upload-placeholder">点击上传图片</span>
            )}
          </div>
        </label>

        <div className="resale-publish__field">
          <span className="resale-publish__label">季节（可多选）</span>
          <div className="resale-publish__chips">
            {SEASON_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={seasonTags.includes(t) ? 'resale-publish__chip resale-publish__chip--on' : 'resale-publish__chip'}
                onClick={() => toggleTag(seasonTags, setSeasonTags, t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="resale-publish__field">
          <span className="resale-publish__label">场合（可多选）</span>
          <div className="resale-publish__chips">
            {OCCASION_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={occasionTags.includes(t) ? 'resale-publish__chip resale-publish__chip--on' : 'resale-publish__chip'}
                onClick={() => toggleTag(occasionTags, setOccasionTags, t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="resale-publish__field">
          <span className="resale-publish__label">性别（可多选）</span>
          <div className="resale-publish__chips">
            {GENDER_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={genderTags.includes(t) ? 'resale-publish__chip resale-publish__chip--on' : 'resale-publish__chip'}
                onClick={() => toggleTag(genderTags, setGenderTags, t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="resale-publish__field">
          <span className="resale-publish__label">年龄段（可多选）</span>
          <div className="resale-publish__chips">
            {AGE_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={ageTags.includes(t) ? 'resale-publish__chip resale-publish__chip--on' : 'resale-publish__chip'}
                onClick={() => toggleTag(ageTags, setAgeTags, t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <label className="resale-publish__field">
          <span className="resale-publish__label">售卖价格（元）</span>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="resale-publish__input"
            placeholder="0.00"
            min="0"
            step="0.01"
            required
          />
        </label>

        {error && <p className="resale-publish__error">{error}</p>}

        <div className="resale-publish__actions">
          <button type="submit" className="resale-publish__btn" disabled={submitting}>
            {submitting ? '提交中...' : '发布'}
          </button>
          <Link to="/resale" className="resale-publish__cancel">取消</Link>
        </div>
      </form>
    </div>
  );
}
