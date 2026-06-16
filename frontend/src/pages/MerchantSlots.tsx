import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './MerchantSlots.css';

const SLOTS = ['上衣', '裤子', '鞋子'] as const;

const STYLE_TAGS = [
  { value: '', label: '全部' },
  { value: '通勤', label: '职场通勤' },
  { value: '约会', label: '约会社交' },
  { value: '过年', label: '节日家庭' },
  { value: '日常', label: '日常休闲' },
  { value: '运动', label: '运动出行' },
];

const GENDER_TAGS = [
  { value: '', label: '全部' },
  { value: '男', label: '男' },
  { value: '女', label: '女' },
];

const AGE_TAGS = [
  { value: '', label: '全部' },
  { value: '18-24', label: '18-24' },
  { value: '25-29', label: '25-29' },
  { value: '30-35', label: '30-35' },
  { value: '35-50', label: '35-50' },
  { value: '50+', label: '50+' },
];

function getCurrentSeasonTag(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

function imageDisplayUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  try {
    return encodeURI(url);
  } catch {
    return url;
  }
}

interface Outfit {
  id: number;
  name: string;
  image_url?: string | null;
  merchant_slots?: { slot: string; merchant_id: number; merchant_name?: string; product_url?: string; product_title?: string }[];
}

interface Merchant {
  id: number;
  name: string;
}

interface SlotForm {
  merchant_id: number | '';
  product_url: string;
  product_title: string;
}

function isPlaceholderOutfitName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name === '1-日常' || name === '2-rc') return true;
  return /^示例搭配[一二三四五六123456]$/.test(name.trim());
}

function simplifyOutfitName(name: string): string {
  const n = (name || '').trim();
  if (!n) return '未命名搭配';
  const cleaned = n
    // 清理结尾随机串：xxx-3ud5w1sbi04mnoq8f
    .replace(/[-_][a-z0-9]{10,}$/gi, '')
    // 清理中间随机 token：xxx-3ud5w1sbi04mnoq8f-yyy
    .replace(/(^|[-_\s])([a-z0-9]{10,})(?=$|[-_\s])/gi, '$1')
    // 合并多余分隔符
    .replace(/[-_]{2,}/g, '-')
    .replace(/^\-+|\-+$/g, '')
    .trim();
  const normalized = cleaned.match(/^(.+)-(男|女)-(\d{1,2}(?:-\d{1,2}|\+)?)-(\d+)$/);
  if (normalized) {
    return `${normalized[1]}-${normalized[2]}-${normalized[3]}-${normalized[4].padStart(2, '0')}`;
  }
  return cleaned;
}

function shouldHideByName(name: string): boolean {
  const n = (name || '').trim();
  if (!n) return false;
  if (n === '男-18-24-05') return true;
  if (n.startsWith('智能穿搭APP用户流程')) return true;
  return false;
}

function canLoadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = imageDisplayUrl(url);
  });
}

export default function MerchantSlots() {
  const { user, token } = useAuth();
  const currentSeasonTag = getCurrentSeasonTag();
  const [styleTag, setStyleTag] = useState('');
  const [genderTag, setGenderTag] = useState('');
  const [ageTag, setAgeTag] = useState('');
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedOutfitId, setSelectedOutfitId] = useState<number | ''>('');
  const [detail, setDetail] = useState<Outfit | null>(null);
  const [forms, setForms] = useState<Record<string, SlotForm>>({
    上衣: { merchant_id: '', product_url: '', product_title: '' },
    裤子: { merchant_id: '', product_url: '', product_title: '' },
    鞋子: { merchant_id: '', product_url: '', product_title: '' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/body-profile/merchants')
      .then((r) => r.json())
      .then((data) => setMerchants(data?.merchants ?? []))
      .catch(() => setMerchants([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const tags = [styleTag, currentSeasonTag, genderTag, ageTag].filter(Boolean);
    const params = new URLSearchParams();
    if (tags.length) params.set('tags', tags.join(','));
    fetch(`/api/outfits?${params}`)
      .then((r) => r.json())
      .then(async (data) => {
        const list = (Array.isArray(data) ? data : []).filter((o: Outfit) => {
          const hasImage = typeof o.image_url === 'string' && o.image_url.trim() !== '';
          if (!hasImage) return false;
          if (isPlaceholderOutfitName(o.name)) return false;
          if (shouldHideByName(o.name)) return false;
          return true;
        });
        const checks = await Promise.all(
          list.map(async (o: Outfit) => ({
            ok: await canLoadImage(o.image_url || ''),
            outfit: o,
          }))
        );
        const visible = checks.filter((x) => x.ok).map((x) => x.outfit);
        if (cancelled) return;
        setOutfits(visible);
        if (selectedOutfitId !== '' && !visible.some((o: Outfit) => o.id === selectedOutfitId)) {
          setSelectedOutfitId('');
        }
      })
      .catch(() => {
        if (!cancelled) setOutfits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [styleTag, currentSeasonTag, genderTag, ageTag]);

  useEffect(() => {
    if (selectedOutfitId === '') {
      setDetail(null);
      setForms({
        上衣: { merchant_id: '', product_url: '', product_title: '' },
        裤子: { merchant_id: '', product_url: '', product_title: '' },
        鞋子: { merchant_id: '', product_url: '', product_title: '' },
      });
      return;
    }
    setLoading(true);
    fetch(`/api/outfits/${selectedOutfitId}`)
      .then((r) => r.json())
      .then((data) => {
        setDetail(data);
        const next: Record<string, SlotForm> = {
          上衣: { merchant_id: '', product_url: '', product_title: '' },
          裤子: { merchant_id: '', product_url: '', product_title: '' },
          鞋子: { merchant_id: '', product_url: '', product_title: '' },
        };
        (data.merchant_slots || []).forEach((s: { slot: string; merchant_id: number; product_url?: string; product_title?: string }) => {
          if (SLOTS.includes(s.slot as typeof SLOTS[number])) {
            next[s.slot] = {
              merchant_id: s.merchant_id,
              product_url: s.product_url || '',
              product_title: s.product_title || '',
            };
          }
        });
        setForms(next);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [selectedOutfitId]);

  const setSlotForm = (slot: typeof SLOTS[number], field: keyof SlotForm, value: string | number) => {
    setForms((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], [field]: value },
    }));
  };

  const saveSlot = async (slot: typeof SLOTS[number]) => {
    if (selectedOutfitId === '') return;
    const f = forms[slot];
    const outfitId = Number(selectedOutfitId);
    setSaving(slot);
    setMessage(null);
    try {
      if (!f.merchant_id || f.merchant_id === '') {
        const res = await fetch(`/api/outfits/${outfitId}/merchant-slots/${slot}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('清空失败');
        setMessage({ type: 'ok', text: `${slot} 已清空` });
        setDetail((prev) => ({
          ...prev!,
          merchant_slots: (prev?.merchant_slots || []).filter((s) => s.slot !== slot),
        }));
        setForms((prev) => ({ ...prev, [slot]: { merchant_id: '', product_url: '', product_title: '' } }));
      } else {
        const res = await fetch(`/api/outfits/${outfitId}/merchant-slots`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            slot,
            merchant_id: f.merchant_id,
            product_url: f.product_url.trim() || undefined,
            product_title: f.product_title.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '保存失败');
        }
        const updated = await res.json();
        setMessage({ type: 'ok', text: `${slot} 已保存` });
        setDetail((prev) => {
          if (!prev) return prev;
          const rest = (prev.merchant_slots || []).filter((s) => s.slot !== slot);
          return { ...prev, merchant_slots: [...rest, { slot: updated.slot, merchant_id: updated.merchant_id, merchant_name: updated.merchant_name, product_url: updated.product_url, product_title: updated.product_title }] };
        });
      }
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setSaving(null);
    }
  };

  if (loading && outfits.length === 0) {
    return (
      <div className="merchant-slots">
        <h1 className="merchant-slots__title">商家入驻槽位管理</h1>
        <p className="merchant-slots__loading">加载中…</p>
      </div>
    );
  }

  if (!user || user.role !== 'merchant') {
    return (
      <div className="merchant-slots">
        <h1 className="merchant-slots__title">商家入驻槽位管理</h1>
        <p className="merchant-slots__forbidden">
          仅商家身份可管理入驻槽位。请先<Link to="/me">登录</Link>，并在「<Link to="/me">我的</Link>」中将身份设为「商家」后再使用。
        </p>
      </div>
    );
  }

  return (
    <div className="merchant-slots">
      <h1 className="merchant-slots__title">商家入驻槽位管理</h1>
      <p className="merchant-slots__intro">
        为衣库中的每套搭配配置「上衣 / 裤子 / 鞋子」三个槽位，每槽可关联一家商家及商品链接，用户点击衣库卡片上的「可购」即可跳转购买。
        每个商家入驻槽位按 29.9 元 / 月计费（当前仅为规则说明，尚未接入实际扣费与结算逻辑）。
      </p>

      <section className="merchant-slots__section">
        <label className="merchant-slots__label">按标签筛选后再选择搭配</label>
        <div className="merchant-slots__filters">
          <div className="merchant-slots__filter-row">
            <span className="merchant-slots__filter-label">风格</span>
            {STYLE_TAGS.map((t) => (
              <button
                key={t.value || 'all-style'}
                type="button"
                className={`merchant-slots__tag ${styleTag === t.value ? 'merchant-slots__tag--active' : ''}`}
                onClick={() => setStyleTag(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="merchant-slots__filter-row">
            <span className="merchant-slots__filter-label">季节</span>
            <button type="button" className="merchant-slots__tag merchant-slots__tag--active" disabled>
              当季（{currentSeasonTag}）
            </button>
          </div>
          <div className="merchant-slots__filter-row">
            <span className="merchant-slots__filter-label">性别</span>
            {GENDER_TAGS.map((t) => (
              <button
                key={t.value || 'all-gender'}
                type="button"
                className={`merchant-slots__tag ${genderTag === t.value ? 'merchant-slots__tag--active' : ''}`}
                onClick={() => setGenderTag(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="merchant-slots__filter-row">
            <span className="merchant-slots__filter-label">年龄段</span>
            {AGE_TAGS.map((t) => (
              <button
                key={t.value || 'all-age'}
                type="button"
                className={`merchant-slots__tag ${ageTag === t.value ? 'merchant-slots__tag--active' : ''}`}
                onClick={() => setAgeTag(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {loading && <p className="merchant-slots__loading-inline">加载中…</p>}
        <div className="merchant-slots__outfit-list">
          {outfits.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`merchant-slots__outfit-item ${selectedOutfitId === o.id ? 'merchant-slots__outfit-item--active' : ''}`}
              onClick={() => setSelectedOutfitId(selectedOutfitId === o.id ? '' : o.id)}
            >
              <div
                className="merchant-slots__outfit-thumb"
                style={{ backgroundImage: o.image_url ? `url("${imageDisplayUrl(o.image_url)}")` : undefined }}
              />
              <span className="merchant-slots__outfit-name">{simplifyOutfitName(o.name)}</span>
            </button>
          ))}
        </div>
      </section>

      {selectedOutfitId !== '' && detail && (
        <>
          {message && (
            <p className={message.type === 'ok' ? 'merchant-slots__msg merchant-slots__msg--ok' : 'merchant-slots__msg merchant-slots__msg--err'}>
              {message.text}
            </p>
          )}
          <section className="merchant-slots__section merchant-slots__slots">
            <h2 className="merchant-slots__subtitle">槽位配置</h2>
            {SLOTS.map((slot) => (
              <div key={slot} className="merchant-slots__card">
                <h3 className="merchant-slots__slot-name">{slot}</h3>
                <div className="merchant-slots__row">
                  <label className="merchant-slots__field">
                    <span>商家</span>
                    <select
                      className="merchant-slots__input"
                      value={forms[slot].merchant_id === '' ? '' : forms[slot].merchant_id}
                      onChange={(e) => setSlotForm(slot, 'merchant_id', e.target.value === '' ? '' : Number(e.target.value))}
                    >
                      <option value="">未入驻</option>
                      {merchants.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="merchant-slots__row">
                  <label className="merchant-slots__field merchant-slots__field--full">
                    <span>商品链接</span>
                    <input
                      type="url"
                      className="merchant-slots__input"
                      placeholder="https://..."
                      value={forms[slot].product_url}
                      onChange={(e) => setSlotForm(slot, 'product_url', e.target.value)}
                    />
                  </label>
                </div>
                <div className="merchant-slots__row">
                  <label className="merchant-slots__field merchant-slots__field--full">
                    <span>商品标题（选填）</span>
                    <input
                      type="text"
                      className="merchant-slots__input"
                      placeholder="如：某款上衣"
                      value={forms[slot].product_title}
                      onChange={(e) => setSlotForm(slot, 'product_title', e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="merchant-slots__btn"
                  disabled={saving !== null}
                  onClick={() => saveSlot(slot)}
                >
                  {saving === slot ? '保存中…' : '保存该槽位'}
                </button>
              </div>
            ))}
          </section>
        </>
      )}

      {selectedOutfitId !== '' && !detail && !loading && (
        <p className="merchant-slots__empty">未找到该搭配详情。</p>
      )}
    </div>
  );
}
