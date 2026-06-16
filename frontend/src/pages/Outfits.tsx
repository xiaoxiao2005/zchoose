import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import OutfitCard from '../components/OutfitCard';
import './Outfits.css';

const STYLE_TAGS = [
  { value: '', label: '全部', scene: '' },
  { value: '通勤', label: '职场通勤', scene: '日常上班 / 会议面试' },
  { value: '约会', label: '约会社交', scene: '约会 / 相亲 / 聚会' },
  { value: '过年', label: '节日家庭', scene: '春节 / 走亲访友 / 婚礼' },
  { value: '日常', label: '日常休闲', scene: '逛街 / Citywalk / 居家' },
  { value: '运动', label: '运动出行', scene: '健身 / 出差 / 短途游' },
];

const GENDER_TAGS = [
  { value: '', label: '全部' },
  { value: '女', label: '女' },
  { value: '男', label: '男' },
];

const AGE_TAGS = [
  { value: '', label: '全部', range: '' },
  { value: '18-24', label: '18-24', range: '校园/初入职场' },
  { value: '25-29', label: '25-29', range: '职场进阶' },
  { value: '30-35', label: '30-35', range: '轻熟通勤' },
  { value: '35-50', label: '35-50', range: '成熟通勤' },
  { value: '50+', label: '50+', range: '沉稳风格' },
];

function getCurrentSeasonTag(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

interface Outfit {
  id: number;
  name: string;
  image_url?: string | null;
  style_tags?: string | null;
  need_points?: number;
  unlocked?: boolean;
  liked?: boolean;
  merchant_slots?: { slot: string; merchant_id: number; merchant_name?: string; product_url?: string; product_title?: string }[];
}

export default function Outfits() {
  const { user } = useAuth();
  const currentSeasonTag = getCurrentSeasonTag();
  const [styleTag, setStyleTag] = useState('');
  const [genderTag, setGenderTag] = useState('');
  const [ageTag, setAgeTag] = useState('');
  const [list, setList] = useState<Outfit[]>([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState<number | null>(null);
  const [zoomImage, setZoomImage] = useState<{ url: string; name: string } | null>(null);
  const zodiacInDatingScene =
    styleTag === '约会' && ageTag === '18-24' && (genderTag === '男' || genderTag === '女');

  useEffect(() => {
    if (!zoomImage) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomImage(null);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [zoomImage]);

  useEffect(() => {
    setLoading(true);
    setVisibleCount(12);
    const controller = new AbortController();
    const params = new URLSearchParams();
    // 星座穿搭归并到「约会 + 18-24 + 男/女」场景下
    const tags = [styleTag, currentSeasonTag, genderTag, ageTag, zodiacInDatingScene ? '星座穿搭' : ''].filter(Boolean);
    if (tags.length) params.set('tags', tags.join(','));
    if (user?.userId) params.set('userId', String(user.userId));
    fetch(`/api/outfits?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setList([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [styleTag, currentSeasonTag, genderTag, ageTag, zodiacInDatingScene, user?.userId]);

  const handleUnlock = async (outfitId: number) => {
    if (!user?.userId) return;
    setUnlocking(outfitId);
    try {
      const res = await fetch('/api/unlocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, outfitId }),
      });
      const data = await res.json();
      if (res.ok && data.unlocked) {
        setList((prev) =>
          prev.map((o) => (o.id === outfitId ? { ...o, unlocked: true } : o))
        );
      } else {
        alert(data.error || '解锁失败');
      }
    } catch {
      alert('请求失败');
    } finally {
      setUnlocking(null);
    }
  };

  const handleLike = async (outfitId: number) => {
    if (!user?.userId) return;
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, outfitId }),
      });
      const data = await res.json();
      if (res.ok && typeof data.liked === 'boolean') {
        setList((prev) =>
          prev.map((o) => (o.id === outfitId ? { ...o, liked: data.liked } : o))
        );
      }
    } catch {
      // 静默失败或可 toast
    }
  };

  return (
    <div className="outfits">
      <section className="outfits__filter">
        <span className="outfits__filter-label">场合</span>
        {STYLE_TAGS.map((t) => (
          <button
            key={t.value ? `style-${t.value}` : 'style-all'}
            type="button"
            className={styleTag === t.value ? 'outfits__tag outfits__tag--active' : 'outfits__tag'}
            onClick={() => {
              setStyleTag(t.value);
            }}
          >
            <span>{t.label}</span>
            {t.scene ? <span className="outfits__tag-range">{t.scene}</span> : null}
          </button>
        ))}
      </section>
      <section className="outfits__filter">
        <span className="outfits__filter-label">性别</span>
        {GENDER_TAGS.map((t) => (
          <button
            key={t.value ? `gender-${t.value}` : 'gender-all'}
            type="button"
            className={genderTag === t.value ? 'outfits__tag outfits__tag--active' : 'outfits__tag'}
            onClick={() => setGenderTag(t.value)}
          >
            {t.label}
          </button>
        ))}
      </section>
      <section className="outfits__filter">
        <span className="outfits__filter-label">年龄段</span>
        {AGE_TAGS.map((t) => (
          <button
            key={t.value ? `age-${t.value}` : 'age-all'}
            type="button"
            className={ageTag === t.value ? 'outfits__tag outfits__tag--active' : 'outfits__tag'}
            onClick={() => setAgeTag(t.value)}
          >
            <span>{t.label}</span>
            {t.range ? <span className="outfits__tag-range">{t.range}</span> : null}
          </button>
        ))}
      </section>
      {loading ? (
        <p className="outfits__loading">加载中...</p>
      ) : list.length === 0 ? (
        <p className="outfits__empty">暂无搭配</p>
      ) : (
        <div className="outfits__grid">
          {list.slice(0, visibleCount).map((o, idx) => (
            <OutfitCard
              key={o.id}
              outfit={o}
              showUnlock={true}
              onUnlock={user?.userId ? handleUnlock : undefined}
              onLike={user?.userId ? handleLike : undefined}
              onImageClick={o.image_url ? (url, name) => setZoomImage({ url, name }) : undefined}
              unlocking={unlocking}
              imagePriority={idx < 4}
            />
          ))}
        </div>
      )}
      {!loading && list.length > visibleCount ? (
        <button
          type="button"
          className="outfits__load-more"
          onClick={() => setVisibleCount((n) => n + 12)}
        >
          加载更多
        </button>
      ) : null}
      {zoomImage && (
        <div
          className="outfits__zoom-overlay"
          onClick={() => setZoomImage(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setZoomImage(null)}
          aria-label="关闭大图"
        >
          <div className="outfits__zoom-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="outfits__zoom-close"
              onClick={() => setZoomImage(null)}
              aria-label="关闭"
            >
              ×
            </button>
            <img
              src={zoomImage.url}
              alt={zoomImage.name}
              className="outfits__zoom-img"
            />
            <div className="outfits__zoom-name">{zoomImage.name}</div>
          </div>
        </div>
      )}
    </div>
  );
}
