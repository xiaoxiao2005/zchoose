import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ResaleMarket.css';

type SourceType = 'user_idle' | 'merchant_clearance';

interface ResaleItem {
  id: number;
  owner_user_id: number | null;
  merchant_id: number | null;
  source_type: SourceType;
  title: string;
  description?: string | null;
  image_url?: string | null;
  image_access_url?: string | null;
  season_tags?: string | null;
  occasion_tags?: string | null;
  gender_tags?: string | null;
  age_tags?: string | null;
  price: number;
  currency: string;
  status: string;
}

const SEASON_TAGS = ['', '春', '夏', '秋', '冬'] as const;
const OCCASION_TAGS = ['', '日常', '通勤', '约会', '运动'] as const;
const GENDER_TAGS = ['', '男', '女'] as const;
const AGE_TAGS = ['', '少年', '青年', '中年', '老年'] as const;

const PRICE_SEGMENTS = [
  { value: '', label: '全部价格' },
  { value: '0-200', label: '0-200' },
  { value: '200-500', label: '200-500' },
  { value: '500-1000', label: '500-1000' },
  { value: '1000-10000', label: '1000-10000' },
  { value: 'luxury', label: '奢侈品' },
] as const;

function imageDisplayUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  try {
    return encodeURI(url);
  } catch {
    return url;
  }
}

function formatTags(v?: string | null): string {
  if (!v) return '';
  return v.split(',').map((t) => t.trim()).filter(Boolean).join(' / ');
}

export default function ResaleMarket() {
  const { user } = useAuth();
  const [sourceType, setSourceType] = useState<SourceType>('user_idle');
  const [season, setSeason] = useState<string>('');
  const [occasion, setOccasion] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [priceSegment, setPriceSegment] = useState<string>('');
  const [list, setList] = useState<ResaleItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('type', sourceType);
    if (season) params.set('season', season);
    if (occasion) params.set('occasion', occasion);
    if (gender) params.set('gender', gender);
    if (age) params.set('age', age);
    if (priceSegment) params.set('price_segment', priceSegment);
    setLoading(true);
    fetch(`/api/resale-items?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [sourceType, season, occasion, gender, age, priceSegment]);

  const isUserIdle = sourceType === 'user_idle';

  return (
    <div className="resale">
      <h2 className="resale__title">闲置衣物与商家过季</h2>
      {user && (
        <div className="resale__actions">
          {user.role !== 'merchant' && (
            <Link to="/resale/new?type=user_idle" className="resale__btn">
              发布闲置衣物
            </Link>
          )}
          {user.role === 'merchant' && (
            <Link to="/resale/new?type=merchant_clearance" className="resale__btn resale__btn--secondary">
              发布商家过季
            </Link>
          )}
        </div>
      )}

      <div className="resale__tabs">
        <button
          type="button"
          className={isUserIdle ? 'resale__tab resale__tab--active' : 'resale__tab'}
          onClick={() => setSourceType('user_idle')}
        >
          闲置衣物
        </button>
        <button
          type="button"
          className={!isUserIdle ? 'resale__tab resale__tab--active' : 'resale__tab'}
          onClick={() => setSourceType('merchant_clearance')}
        >
          商家过季
        </button>
      </div>

      <section className="resale__filter">
        <span className="resale__filter-label">季节</span>
        {SEASON_TAGS.map((t) => (
          <button
            key={t || 'all'}
            type="button"
            className={season === t ? 'resale__tag resale__tag--active' : 'resale__tag'}
            onClick={() => setSeason(t)}
          >
            {t || '全部'}
          </button>
        ))}
      </section>

      <section className="resale__filter">
        <span className="resale__filter-label">场合</span>
        {OCCASION_TAGS.map((t) => (
          <button
            key={t || 'all'}
            type="button"
            className={occasion === t ? 'resale__tag resale__tag--active' : 'resale__tag'}
            onClick={() => setOccasion(t)}
          >
            {t || '全部'}
          </button>
        ))}
      </section>

      <section className="resale__filter">
        <span className="resale__filter-label">性别</span>
        {GENDER_TAGS.map((t) => (
          <button
            key={t || 'all'}
            type="button"
            className={gender === t ? 'resale__tag resale__tag--active' : 'resale__tag'}
            onClick={() => setGender(t)}
          >
            {t || '全部'}
          </button>
        ))}
      </section>

      <section className="resale__filter">
        <span className="resale__filter-label">年龄段</span>
        {AGE_TAGS.map((t) => (
          <button
            key={t || 'all'}
            type="button"
            className={age === t ? 'resale__tag resale__tag--active' : 'resale__tag'}
            onClick={() => setAge(t)}
          >
            {t || '全部'}
          </button>
        ))}
      </section>

      <section className="resale__filter">
        <span className="resale__filter-label">价格</span>
        {PRICE_SEGMENTS.map((p) => (
          <button
            key={p.value || 'all'}
            type="button"
            className={priceSegment === p.value ? 'resale__tag resale__tag--active' : 'resale__tag'}
            onClick={() => setPriceSegment(p.value)}
          >
            {p.label}
          </button>
        ))}
      </section>

      {loading ? (
        <p className="resale__loading">加载中...</p>
      ) : list.length === 0 ? (
        <p className="resale__empty">暂无{isUserIdle ? '闲置衣物' : '过季衣物'}</p>
      ) : (
        <div className="resale__grid">
          {list.map((item) => {
            const img = imageDisplayUrl((item.image_access_url || item.image_url) ?? null);
            return (
              <article key={item.id} className="resale__card">
                <div className="resale__card-img-wrap">
                  {img ? (
                    <img src={img} alt={item.title} className="resale__card-img" />
                  ) : (
                    <div className="resale__card-placeholder">无图</div>
                  )}
                  <span className="resale__badge">
                    {item.source_type === 'user_idle' ? '闲置' : '过季'}
                  </span>
                </div>
                <div className="resale__card-body">
                  <h3 className="resale__card-title">{item.title}</h3>
                  {item.description && (
                    <p className="resale__card-desc">{item.description}</p>
                  )}
                  <div className="resale__card-tags">
                    {formatTags(item.season_tags) && (
                      <span>{formatTags(item.season_tags)}</span>
                    )}
                    {formatTags(item.occasion_tags) && (
                      <span>{formatTags(item.occasion_tags)}</span>
                    )}
                    {formatTags(item.gender_tags) && (
                      <span>{formatTags(item.gender_tags)}</span>
                    )}
                    {formatTags(item.age_tags) && (
                      <span>{formatTags(item.age_tags)}</span>
                    )}
                  </div>
                  <div className="resale__card-footer">
                    <span className="resale__price">
                      ￥{item.price.toFixed(2)}
                    </span>
                    <span className="resale__status">
                      {item.status === 'sold'
                        ? '已售出'
                        : item.status === 'offline'
                        ? '已下架'
                        : '在售'}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

