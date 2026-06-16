import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCity } from '../hooks/useCity';
import OutfitCard from '../components/OutfitCard';
import './Recommend.css';

const CITIES = ['绵阳', '北京', '上海', '广州', '深圳', '杭州', '成都', '西安'];
const OCCASIONS = ['日常', '通勤', '约会', '运动'];

interface Outfit {
  id: number;
  name: string;
  image_url?: string | null;
  style_tags?: string | null;
  need_points?: number;
  unlocked?: boolean;
  weather_score?: number;
  weather_score_reasons?: string[];
}

interface RecommendData {
  weather: { temp: number; desc: string; city: string };
  occasion: string;
  suggestion?: string;
  outfits: Outfit[];
}

export default function Recommend() {
  const { user } = useAuth();
  const [city, setCity] = useCity();
  const [occasion, setOccasion] = useState('日常');
  const [data, setData] = useState<RecommendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState<number | null>(null);

  const fetchRecommend = (random = false, refresh = false) => {
    setLoading(true);
    const params = new URLSearchParams({ city, occasion });
    if (user?.userId) params.set('userId', String(user.userId));
    if (random) params.set('random', '1');
    if (refresh) params.set('refresh', '1');
    fetch(`/api/recommend?${params}`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRecommend();
  }, [city, occasion, user?.userId]);

  const handleUnlock = async (outfitId: number) => {
    if (!user?.userId) return;
    setUnlocking(outfitId);
    try {
      const res = await fetch('/api/unlocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, outfitId }),
      });
      const result = await res.json();
      if (res.ok && result.unlocked && data) {
        setData({
          ...data,
          outfits: data.outfits.map((o) => (o.id === outfitId ? { ...o, unlocked: true } : o)),
        });
      } else {
        alert(result.error || '解锁失败');
      }
    } catch {
      alert('请求失败');
    } finally {
      setUnlocking(null);
    }
  };

  const handleRecord = (outfitId: number) => {
    if (!user?.userId || !data) return;
    fetch('/api/recommend/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        outfitId,
        occasion: data.occasion,
        weatherTemp: data.weather?.temp,
        weatherDesc: data.weather?.desc,
      }),
    }).catch(() => {});
  };

  return (
    <div className="recommend">
      <div className="recommend__head">
        <div className="recommend__weather">
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="recommend__weather-text">
            {data?.weather ? `${data.weather.city} ${data.weather.temp}°C ${data.weather.desc}` : '加载中...'}
          </span>
        </div>
        <div className="recommend__occasion">
          <span>场合：</span>
          {OCCASIONS.map((o) => (
            <button
              key={o}
              type="button"
              className={occasion === o ? 'recommend__tag recommend__tag--active' : 'recommend__tag'}
              onClick={() => setOccasion(o)}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="recommend__actions">
          <button type="button" className="recommend__btn" onClick={() => fetchRecommend(false, true)}>
            换一换
          </button>
          <button type="button" className="recommend__btn" onClick={() => fetchRecommend(true)}>
            随机抽一套
          </button>
        </div>
      </div>

      {data?.suggestion && (
        <p className="recommend__suggestion">{data.suggestion}</p>
      )}
      <p className="recommend__hint">已按当前天气进行二次优化排序</p>

      {loading ? (
        <p className="recommend__loading">加载中...</p>
      ) : data?.outfits?.length ? (
        <div className="recommend__grid">
          {data.outfits.map((o) => (
            <div key={o.id} className="recommend__card-wrap">
              <OutfitCard
                outfit={o}
                showUnlock={true}
                onUnlock={user?.userId ? handleUnlock : undefined}
                onTryClick={user?.userId ? handleRecord : undefined}
                unlocking={unlocking}
              />
              {o.weather_score_reasons?.length ? (
                <p className="recommend__reason" title={o.weather_score_reasons.join('；')}>
                  推荐原因：{o.weather_score_reasons.slice(0, 2).join('；')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="recommend__empty">暂无推荐，换个城市或场合试试</p>
      )}
    </div>
  );
}
