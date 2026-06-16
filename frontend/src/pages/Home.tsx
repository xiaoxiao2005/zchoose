import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCity } from '../hooks/useCity';
import { imageDisplayUrl } from '../utils/imageDisplayUrl';
import './Home.css';

interface Weather {
  temp: number;
  desc: string;
  city: string;
}

interface Outfit {
  id: number;
  name: string;
  image_url?: string;
  style_tags?: string;
  source?: 'outfit' | 'wardrobe';
  wardrobe_item_id?: number;
}

/** 与后端 /api/recommend 的 recommend_meta 对齐（可解释推荐） */
interface RecommendMeta {
  weather_scoring_enabled: boolean;
  live_weather_enabled: boolean;
  explain_summary: string;
}

const CITY_OPTIONS = ['绵阳', '北京', '上海', '广州', '深圳', '杭州', '成都', '西安'];
const GROUP_SIZE = 3;
const RECOMMEND_LIMIT = 3;
/** 首页推荐整请求超时：真实天气（和风两步）+ MySQL 筛选可能 >20s，与后端 RECOMMEND_WEATHER_BUDGET_MS 对齐留余量 */
const RECOMMEND_FETCH_MS = 60000;

/*
 * 【插入图片】大厅推荐轮播 - 只需在下方常量填路径即可，图片请放入 frontend/public/images/
 * 1. CAROUSEL_ARROW_LEFT_IMG   - 左箭头图标（留空用文字 ‹）
 * 2. CAROUSEL_ARROW_RIGHT_IMG  - 右箭头图标（留空用文字 ›）
 * 3. CARD_PLACEHOLDER_IMG      - 推荐卡片无图时的占位图（留空用灰色渐变）
 * 指示点（小圆点）若要用图片，见 Home.css 中 .home__dot / .home__dot--active 的批注
 */
/** 【插入图片】左箭头：如 '/images/carousel-arrow-left.png'；留空则用 ‹ */
const CAROUSEL_ARROW_LEFT_IMG = '/images/carousel-arrow-left.png';
/** 【插入图片】右箭头：如 '/images/carousel-arrow-right.png'；留空则用 › */
const CAROUSEL_ARROW_RIGHT_IMG = '/images/carousel-arrow-right.png';
/** 【插入图片】卡片无图占位：如 '/images/home-card-placeholder.png'；留空则灰色渐变 */
const CARD_PLACEHOLDER_IMG = '';

function chunk<T>(arr: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    groups.push(arr.slice(i, i + size));
  }
  return groups;
}

function simplifyOutfitName(name: string): string {
  if (!name) return '';
  let text = name.trim();
  // 去掉末尾常见随机后缀：如 xxx-du6zmuhl894mnoplwe3
  text = text.replace(/-[a-z0-9]{10,}$/i, '');
  // 去掉末尾纯数字序号：如 xxx-12
  text = text.replace(/-\d{1,3}$/, '');
  // 首页卡片做简短显示
  return text.length > 20 ? `${text.slice(0, 20)}...` : text;
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [city, setCity] = useCity();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [suggestion, setSuggestion] = useState<string>('');
  const [groups, setGroups] = useState<Outfit[][]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [recommendMeta, setRecommendMeta] = useState<RecommendMeta | null>(null);
  const [zoomOutfit, setZoomOutfit] = useState<Outfit | null>(null);

  const fetchRecommend = useCallback(async (random = false, refresh = false) => {
    setLoading(true);
    setFetchError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), RECOMMEND_FETCH_MS);
    try {
      const limit = random ? 1 : RECOMMEND_LIMIT;
      const res = await fetch(
        `/api/recommend?city=${encodeURIComponent(city)}&occasion=日常&limit=${limit}${random ? '&random=1' : ''}${refresh ? '&refresh=1' : ''}${user?.userId ? `&userId=${user.userId}` : ''}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`服务暂时不可用（HTTP ${res.status}）`);
      }
      const data = (await res.json()) as {
        weather?: { temp?: number; desc?: string; city?: string };
        suggestion?: string;
        outfits?: unknown;
        recommend_meta?: RecommendMeta;
      };
      const w = data.weather;
      setWeather(
        w && (typeof w.temp === 'number' || typeof w.desc === 'string')
          ? {
              temp: typeof w.temp === 'number' ? w.temp : 22,
              desc: typeof w.desc === 'string' ? w.desc : '晴',
              city: typeof w.city === 'string' ? w.city : city,
            }
          : null
      );
      setSuggestion(typeof data.suggestion === 'string' ? data.suggestion : '');
      const m = data.recommend_meta;
      if (
        m &&
        typeof m.explain_summary === 'string' &&
        typeof m.weather_scoring_enabled === 'boolean' &&
        typeof m.live_weather_enabled === 'boolean'
      ) {
        setRecommendMeta(m);
      } else {
        setRecommendMeta(null);
      }
      const raw = data.outfits;
      const list: Outfit[] = Array.isArray(raw)
        ? raw
            .map((o) => {
              if (o == null || typeof o !== 'object') return null;
              const x = o as Record<string, unknown>;
              const rawId = x.id;
              const id =
                typeof rawId === 'number' && Number.isFinite(rawId)
                  ? Math.trunc(rawId)
                  : typeof rawId === 'string' && /^\d+$/.test(rawId.trim())
                    ? Number.parseInt(rawId.trim(), 10)
                    : NaN;
              if (!Number.isInteger(id) || id <= 0) return null;
              return { ...(o as object), id } as Outfit;
            })
            .filter((o): o is Outfit => o != null)
        : [];
      setGroups(random ? [list] : chunk(list, GROUP_SIZE));
      setCurrentGroupIndex(0);
    } catch (e) {
      clearTimeout(timer);
      const msg =
        e instanceof Error && e.name === 'AbortError'
          ? '请求超时，请检查网络或确认后端已启动（端口 3001）'
          : e instanceof Error
            ? e.message
            : '加载失败';
      setFetchError(msg);
      setWeather({ temp: 22, desc: '晴', city });
      setSuggestion('');
      setRecommendMeta(null);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [city, user?.userId]);

  useEffect(() => {
    fetchRecommend();
  }, [fetchRecommend]);

  const recordAndGoTryOn = async (item: Outfit) => {
    const isWardrobe = item.source === 'wardrobe' && Number.isInteger(item.wardrobe_item_id);
    if (!isWardrobe && user?.userId && weather) {
      try {
        await fetch('/api/recommend/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.userId,
            outfitId: item.id,
            occasion: '日常',
            weatherTemp: weather.temp,
            weatherDesc: weather.desc,
          }),
        });
      } catch { /* ignore */ }
    }
    if (isWardrobe) {
      navigate(`/tryon?wardrobeItemId=${item.wardrobe_item_id}`);
    } else {
      navigate(`/tryon?outfitId=${item.id}`);
    }
  };

  const currentGroup = groups[currentGroupIndex];
  const hasMultipleGroups = groups.length > 1;
  const hasNoOutfits = !loading && !currentGroup?.length;

  return (
    <div className="home">
      <nav className="home__tabs" aria-label="页面导航">
        <Link to="/home" className="home__tab home__tab--active">首页</Link>
        <Link to="/outfits" className="home__tab">衣库</Link>
        <Link to="/resale" className="home__tab">闲置</Link>
        <Link to="/recommend" className="home__tab">快速穿搭</Link>
        <Link to="/support" className="home__tab">客服</Link>
        <Link to="/me" className="home__tab">我的</Link>
      </nav>
      <section className="home__weather">
        <span className="home__weather-text">
          {loading && !weather
            ? `今日 正在读取天气与推荐… · ${city}`
            : weather
              ? `今日 ${weather.temp}°C ${weather.desc} · ${weather.city}`
              : `今日 --°C -- · ${city}`}
        </span>
        <select
          className="home__weather-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          title="切换城市"
        >
          {CITY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="home__weather-actions">
          <button type="button" onClick={() => fetchRecommend(false, true)} disabled={loading}>
            换一换
          </button>
          <button type="button" onClick={() => fetchRecommend(true)} disabled={loading}>
            随机抽一套
          </button>
        </div>
      </section>

      <section className="home__recommend">
        <h2 className="home__section-title">今日推荐</h2>
        {fetchError && !loading && (
          <p className="home__empty home__empty--inline" role="alert">
            {fetchError}
          </p>
        )}
        {suggestion && !loading && (
          <p className="home__suggestion">{suggestion}</p>
        )}
        {recommendMeta?.explain_summary && !loading && (
          <p className="home__recommend-meta" title="推荐策略说明">
            {recommendMeta.explain_summary}
          </p>
        )}
        {loading ? (
          <p className="home__loading">加载中...</p>
        ) : hasNoOutfits ? (
          <p className="home__empty">暂无推荐，请稍后再试或去衣库挑选搭配。</p>
        ) : (
          <>
            <div className="home__carousel">
              {hasMultipleGroups && (
                <button
                  type="button"
                  className="home__carousel-arrow home__carousel-arrow--left"
                  onClick={() => setCurrentGroupIndex((i) => (i <= 0 ? groups.length - 1 : i - 1))}
                  aria-label="上一组"
                >
                  {CAROUSEL_ARROW_LEFT_IMG ? (
                    <img
                      src={CAROUSEL_ARROW_LEFT_IMG}
                      alt=""
                      className="home__carousel-arrow-img"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const span = e.currentTarget.nextElementSibling;
                        if (span) (span as HTMLElement).style.display = 'inline';
                      }}
                    />
                  ) : null}
                  {!CAROUSEL_ARROW_LEFT_IMG && <span className="home__placeholder-marker">【左箭头】</span>}
                  {CAROUSEL_ARROW_LEFT_IMG && (
                    <span className="home__carousel-arrow-fallback" style={{ display: 'none' }}>‹</span>
                  )}
                </button>
              )}
              <div className="home__cards">
                {(currentGroup || []).map((o) => (
                  (() => {
                    const shortName = simplifyOutfitName(o.name);
                    return (
                  <div key={o.id} className="home__card">
                    <div
                      className={`home__card-img ${!o.image_url && !CARD_PLACEHOLDER_IMG ? 'home__card-img--placeholder' : ''}`}
                      onClick={() => o.image_url && setZoomOutfit(o)}
                      role={o.image_url ? 'button' : undefined}
                      aria-label={o.image_url ? `放大查看 ${o.name}` : undefined}
                      style={{
                        backgroundColor: '#1c1c22',
                        ...(o.image_url
                          ? {
                              // 与衣库 OutfitCard 同源：含中文目录、空格、括号文件名时需 imageDisplayUrl，否则首页易白块
                              backgroundImage: `url("${imageDisplayUrl(o.image_url)}")`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : CARD_PLACEHOLDER_IMG
                            ? {
                                backgroundImage: `url(${CARD_PLACEHOLDER_IMG})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                              }
                            : {}),
                      }}
                    >
                      <span className={o.source === 'wardrobe' ? 'home__source-badge home__source-badge--wardrobe' : 'home__source-badge home__source-badge--outfit'}>
                        {o.source === 'wardrobe' ? '我的衣库' : '官方衣库'}
                      </span>
                    </div>
                    <div className="home__card-name" title={o.name}>{shortName || o.name}</div>
                    <button
                      type="button"
                      className="home__card-btn"
                      onClick={() => recordAndGoTryOn(o)}
                    >
                      去试穿
                    </button>
                  </div>
                    );
                  })()
                ))}
              </div>
              {hasMultipleGroups && (
                <button
                  type="button"
                  className="home__carousel-arrow home__carousel-arrow--right"
                  onClick={() => setCurrentGroupIndex((i) => (i >= groups.length - 1 ? 0 : i + 1))}
                  aria-label="下一组"
                >
                  {CAROUSEL_ARROW_RIGHT_IMG ? (
                    <img
                      src={CAROUSEL_ARROW_RIGHT_IMG}
                      alt=""
                      className="home__carousel-arrow-img"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const span = e.currentTarget.nextElementSibling;
                        if (span) (span as HTMLElement).style.display = 'inline';
                      }}
                    />
                  ) : null}
                  {!CAROUSEL_ARROW_RIGHT_IMG && <span className="home__placeholder-marker">【右箭头】</span>}
                  {CAROUSEL_ARROW_RIGHT_IMG && (
                    <span className="home__carousel-arrow-fallback" style={{ display: 'none' }}>›</span>
                  )}
                </button>
              )}
            </div>
            {hasMultipleGroups && (
              <div className="home__dots-wrap">
                <div className="home__dots">
                  {groups.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`home__dot ${i === currentGroupIndex ? 'home__dot--active' : ''}`}
                      onClick={() => setCurrentGroupIndex(i)}
                      aria-label={`第 ${i + 1} 组`}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="home__cta">
        <Link to="/tryon" className="home__cta-btn home__cta-btn--primary">
          立即试衣
        </Link>
        <Link to="/recommend" className="home__cta-btn home__cta-btn--secondary">
          快速穿搭
        </Link>
      </section>
      {zoomOutfit && zoomOutfit.image_url && (
        <div className="home__zoom" onClick={() => setZoomOutfit(null)} role="button" aria-label="关闭大图预览">
          <div className="home__zoom-inner">
            <img
              src={imageDisplayUrl(zoomOutfit.image_url)}
              alt={zoomOutfit.name}
              className="home__zoom-img"
            />
            <p className="home__zoom-name">{zoomOutfit.name}</p>
            <p className="home__zoom-hint">点击任意位置关闭</p>
          </div>
        </div>
      )}
    </div>
  );
}
