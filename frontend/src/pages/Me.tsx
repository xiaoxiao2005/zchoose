import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { IconEnergy, IconStreak, IconPoints } from '../components/IncentiveIcons';
import { MEMBERSHIP_TIERS } from '../data/membershipTiers';
import { checkImageQuality, checkImageQualityFromUrl } from '../utils/imageQuality';
import './Me.css';

interface StyleProfile {
  totalRecords: number;
  summary: string;
  topStyleTags: { name: string; count: number }[];
  /** 近期试穿/选择记录缩略图（后端已将 /uploads/ 换为可加载的访问 URL） */
  recentItems?: { name: string; kind: 'outfit' | 'wardrobe'; imageUrl: string | null }[];
}

interface DailyQuota {
  tryonUsed: number;
  tryonLimit: number;
  tryonRemaining: number;
  downloadUsed: number;
  downloadLimit: number;
  downloadRemaining: number;
  dailyPoints: number;
  pointsPerTryon: number;
}

interface Incentives {
  points: number;
  energy: number;
  streakDays: number;
  dailyQuota?: DailyQuota;
  recentPointLogs?: {
    id: number;
    change_amount: number;
    reason?: string | null;
    created_at: string;
  }[];
}

interface WardrobeItem {
  id: number;
  name?: string | null;
  image_url: string;
  created_at?: string;
}

interface RadarDatum {
  label: string;
  value: number;
}

function StyleRadarChart({ data }: { data: RadarDatum[] }) {
  if (data.length < 3) return null;
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 90;
  const levels = 4;
  const steps = data.map((_, i) => (Math.PI * 2 * i) / data.length - Math.PI / 2);
  const labelRadius = radius + 18;
  const axisPoints = steps.map((angle) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  }));
  const polygons = Array.from({ length: levels }, (_, idx) => {
    const rate = (idx + 1) / levels;
    return steps
      .map((angle) => {
        const x = cx + radius * rate * Math.cos(angle);
        const y = cy + radius * rate * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');
  });
  const shapePoints = data
    .map((d, i) => {
      const r = radius * Math.max(0, Math.min(1, d.value));
      const x = cx + r * Math.cos(steps[i]);
      const y = cy + r * Math.sin(steps[i]);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="me__radar-wrap" aria-label="风格雷达图">
      <svg viewBox={`0 0 ${size} ${size}`} className="me__radar">
        {polygons.map((points, idx) => (
          <polygon key={`grid-${idx}`} points={points} className="me__radar-grid" />
        ))}
        {axisPoints.map((p, idx) => (
          <line key={`axis-${idx}`} x1={cx} y1={cy} x2={p.x} y2={p.y} className="me__radar-axis" />
        ))}
        <polygon points={shapePoints} className="me__radar-shape" />
        {data.map((d, idx) => {
          const r = radius * Math.max(0, Math.min(1, d.value));
          const x = cx + r * Math.cos(steps[idx]);
          const y = cy + r * Math.sin(steps[idx]);
          return <circle key={`dot-${d.label}`} cx={x} cy={y} r={3.5} className="me__radar-dot" />;
        })}
        {data.map((d, idx) => {
          const x = cx + labelRadius * Math.cos(steps[idx]);
          const y = cy + labelRadius * Math.sin(steps[idx]);
          return (
            <text key={`label-${d.label}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="me__radar-label">
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function Me() {
  const { user, logout, token, handleUnauthorized, updateUser } = useAuth();
  const [incentives, setIncentives] = useState<Incentives | null>(null);
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState('');
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [preferredGender, setPreferredGender] = useState<'男' | '女' | ''>('');
  const [preferredAge, setPreferredAge] = useState<'少年' | '青年' | '中年' | '老年' | ''>('');
  const [role, setRole] = useState<'user' | 'merchant'>('user');
  const [merchantVerificationStatus, setMerchantVerificationStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [merchantCompanyName, setMerchantCompanyName] = useState('');
  const [merchantLicenseNo, setMerchantLicenseNo] = useState('');
  const [membershipActive, setMembershipActive] = useState(false);
  const [memberExpiresAt, setMemberExpiresAt] = useState<string | null>(null);
  const [memberTier, setMemberTier] = useState<string | null>(null);
  const [memberFreeUnlocks, setMemberFreeUnlocks] = useState(0);
  const [payLoadingTier, setPayLoadingTier] = useState<string | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [submissions, setSubmissions] = useState<unknown[]>([]);
  const [claims, setClaims] = useState<unknown[]>([]);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTabState] = useState<'info' | 'wardrobe' | 'submissions' | 'douyin' | 'style'>(() => {
    if (tabParam === 'wardrobe' || tabParam === 'submissions' || tabParam === 'douyin' || tabParam === 'style') return tabParam;
    return 'info';
  });
  const setTab = (t: 'info' | 'wardrobe' | 'submissions' | 'douyin' | 'style') => {
    setTabState(t);
    const next = new URLSearchParams(searchParams);
    if (t === 'info') next.delete('tab'); else next.set('tab', t);
    setSearchParams(next, { replace: true });
  };
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [wardrobeUploading, setWardrobeUploading] = useState(false);
  const [wardrobeUploadError, setWardrobeUploadError] = useState('');
  const [wardrobeQualityMap, setWardrobeQualityMap] = useState<Record<number, { score: number; pass: boolean }>>({});

  useEffect(() => {
    if (tabParam === 'wardrobe' || tabParam === 'submissions' || tabParam === 'douyin' || tabParam === 'style') setTabState(tabParam);
  }, [tabParam]);

  const loadWardrobeItems = async () => {
    if (!token || !user?.userId) return;
    const res = await fetch('/api/wardrobe/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => []);
    setWardrobeItems(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (!user?.userId) return;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(`/api/users/${user.userId}/profile`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setNickname(data.nickname ?? '');
          setAvatarUrl(data.avatar_url ?? '');
          setAvatarDisplayUrl(data.avatar_display_url || data.avatar_url || '');
          setAvatarImgError(false);
          setPreferredGender((data.preferred_gender === '男' || data.preferred_gender === '女') ? data.preferred_gender : '');
          setPreferredAge((data.preferred_age && ['少年', '青年', '中年', '老年'].includes(data.preferred_age)) ? data.preferred_age : '');
          const r = data.role === 'merchant' ? 'merchant' : 'user';
          setRole(r);
          updateUser({ role: r });
          setMerchantVerificationStatus(
            data.merchant_verification_status === 'approved'
              ? 'approved'
              : data.merchant_verification_status === 'rejected'
                ? 'rejected'
                : data.merchant_verification_status === 'pending'
                  ? 'pending'
                  : 'none'
          );
          const active = !!(data.membership_active ?? data.is_member);
          setMembershipActive(active);
          setMemberExpiresAt(data.member_expires_at ?? null);
          setMemberTier(data.member_tier ?? null);
          setMemberFreeUnlocks(Math.max(0, Number(data.member_free_unlocks_remaining) || 0));
        }
      })
      .catch(() => {});
  }, [user?.userId, token, profileVersion]);

  const paymentStatus = searchParams.get('payment');
  const checkoutSessionId = searchParams.get('session_id');

  useEffect(() => {
    if (paymentStatus !== 'success' || !checkoutSessionId?.trim() || !token || !user?.userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/payments/complete-session?session_id=${encodeURIComponent(checkoutSessionId.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && (data as { ok?: boolean }).ok) {
          setProfileVersion((v) => v + 1);
        } else if (!cancelled && !res.ok) {
          alert((data as { error?: string }).error || '确认支付状态失败');
        }
      } catch {
        if (!cancelled) alert('确认支付失败，请稍后在我的页面刷新或联系客服');
      } finally {
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('payment');
              next.delete('session_id');
              return next;
            },
            { replace: true }
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentStatus, checkoutSessionId, token, user?.userId, setSearchParams]);

  useEffect(() => {
    if (!user?.userId) return;
    fetch(`/api/incentives/${user.userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === 'object') {
          setIncentives({
            points: Number(data.points) || 0,
            energy: Number(data.energy) || 0,
            streakDays: Number(data.streakDays) || 0,
            dailyQuota: data.dailyQuota ?? undefined,
          });
        } else {
          setIncentives(null);
        }
      })
      .catch(() => setIncentives(null));
  }, [user?.userId]);

  useEffect(() => {
    if (!user?.userId) return;
    fetch(`/api/submissions/my/${user.userId}`)
      .then((res) => res.json())
      .then((data) => setSubmissions(Array.isArray(data) ? data : []))
      .catch(() => setSubmissions([]));
  }, [user?.userId]);

  useEffect(() => {
    if (!user?.userId) return;
    fetch(`/api/douyin/claims/my/${user.userId}`)
      .then((res) => res.json())
      .then((data) => setClaims(Array.isArray(data) ? data : []))
      .catch(() => setClaims([]));
  }, [user?.userId]);

  useEffect(() => {
    if (!user?.userId) return;
    fetch(`/api/profile/${user.userId}/style`)
      .then((res) => res.ok ? res.json() : null)
      .then(setStyleProfile)
      .catch(() => setStyleProfile(null));
  }, [user?.userId]);

  useEffect(() => {
    void loadWardrobeItems();
  }, [token, user?.userId]);

  useEffect(() => {
    if (wardrobeItems.length === 0) {
      setWardrobeQualityMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        wardrobeItems.map(async (item) => {
          try {
            const src = item.image_url.startsWith('http')
              ? item.image_url
              : `${window.location.origin}${item.image_url.startsWith('/') ? '' : '/'}${item.image_url}`;
            const q = await checkImageQualityFromUrl(src);
            return [item.id, { score: q.score, pass: q.pass }] as const;
          } catch {
            return [item.id, { score: 0, pass: false }] as const;
          }
        })
      );
      if (!cancelled) setWardrobeQualityMap(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [wardrobeItems]);

  const saveUserProfile = async () => {
    if (!user?.userId) return;
    setProfileSaving(true);
    try {
      let nextRole: 'user' | 'merchant' = role;
      if (role === 'merchant' && user.role !== 'merchant') {
        if (!token) {
          alert('请先登录后提交商家资质');
          return;
        }
        if (!merchantCompanyName.trim() || !merchantLicenseNo.trim()) {
          alert('请先填写公司名称和资质编号');
          return;
        }
        const verifyRes = await fetch(`/api/users/${user.userId}/merchant-verification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            company_name: merchantCompanyName.trim(),
            license_no: merchantLicenseNo.trim(),
            contact_name: nickname.trim() || undefined,
            contact_phone: user.phone || undefined,
          }),
        });
        const verifyData = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok) {
          alert((verifyData as { error?: string }).error || '提交商家资质失败');
          return;
        }
        setMerchantVerificationStatus('pending');
        nextRole = 'user';
        setRole('user');
        updateUser({ role: 'user' });
        alert('商家资质已提交，审核通过后将自动识别为商家');
      }
      const res = await fetch(`/api/users/${user.userId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim() || undefined,
          avatar_url: avatarUrl || undefined,
          preferred_gender: preferredGender || undefined,
          preferred_age: preferredAge || undefined,
          role: nextRole,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNickname(data.nickname ?? '');
        setAvatarUrl(data.avatar_url ?? '');
        setAvatarDisplayUrl((data.avatar_display_url || data.avatar_url) ?? '');
        setPreferredGender((data.preferred_gender === '男' || data.preferred_gender === '女') ? data.preferred_gender : '');
        setPreferredAge((data.preferred_age && ['少年', '青年', '中年', '老年'].includes(data.preferred_age)) ? data.preferred_age : '');
        const r = data.role === 'merchant' ? 'merchant' : 'user';
        setRole(r);
        updateUser({ role: r });
      }
    } catch {
      // ignore
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.userId) return;
    if (!token) {
      alert('请先登录后再上传头像');
      e.target.value = '';
      return;
    }
    setAvatarUploading(true);
    setAvatarImgError(false);
    const form = new FormData();
    form.append('photo', file);
    try {
      const res = await fetch('/api/upload/photo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleUnauthorized(res)) {
          alert('登录已过期，请重新登录');
          return;
        }
        alert((data?.error as string) || '上传失败，请重试');
        return;
      }
      if (!data?.photo_url) {
        alert('上传失败，未返回图片地址');
        return;
      }
      setAvatarUrl(data.photo_url);
      try {
        const putRes = await fetch(`/api/users/${user.userId}/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_url: data.photo_url }),
        });
        const putData = putRes.ok ? await putRes.json().catch(() => ({})) : {};
        setAvatarDisplayUrl(putData.avatar_display_url || putData.avatar_url || data.photo_url);
      } catch (_) {
        // 保存资料失败时用带 token 的地址兜底，头像仍可显示
        setAvatarDisplayUrl(data.photo_access_url || data.photo_url);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败，请检查网络');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const tierDisplayName = (id: string | null) =>
    MEMBERSHIP_TIERS.find((x) => x.id === id)?.name ?? (id ? id : '会员');

  const formatMemberDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const startMembershipPay = async (tierId: string) => {
    if (!token || !user?.userId) {
      alert('请先登录');
      return;
    }
    const runMockPay = async (): Promise<boolean> => {
      const mockRes = await fetch('/api/payments/mock-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier: tierId }),
      });
      const mockData = await mockRes.json().catch(() => ({}));
      if (handleUnauthorized(mockRes)) {
        alert('登录已过期，请重新登录');
        return false;
      }
      if (!mockRes.ok) {
        alert((mockData as { error?: string }).error || '模拟支付失败');
        return false;
      }
      alert('模拟支付成功，会员已开通');
      setProfileVersion((v) => v + 1);
      return true;
    };

    setPayLoadingTier(tierId);
    try {
      const res = await fetch('/api/payments/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier: tierId }),
      });
      const data = await res.json().catch(() => ({}));
      if (handleUnauthorized(res)) {
        alert('登录已过期，请重新登录');
        return;
      }
      if (!res.ok) {
        const errData = data as { error?: string; hint?: string; detail?: string };
        if (res.status === 503) {
          // 开发环境允许一键走模拟支付，避免 Stripe 密钥未配置阻塞联调。
          if (import.meta.env.DEV) {
            const ok = window.confirm(
              `${errData.error || '未配置在线支付'}\n是否使用开发环境模拟支付继续联调？`
            );
            if (ok) {
              await runMockPay();
              return;
            }
          }
          alert(`${errData.error || '当前暂未开通在线支付'}\n${errData.hint || '请先联系平台客服处理开通。'}`);
          window.location.href = '/support';
          return;
        }
        alert(errData.error || errData.detail || '创建支付失败');
        return;
      }
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } finally {
      setPayLoadingTier(null);
    }
  };

  if (!user) {
    return (
      <div className="me">
        <p className="me__login-hint">请先登录</p>
      </div>
    );
  }

  return (
    <div className="me">
      <div className="me__tabs">
        {(['info', 'wardrobe', 'submissions', 'douyin', 'style'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? 'me__tab me__tab--active' : 'me__tab'}
            onClick={() => setTab(t)}
          >
            {t === 'info' ? '个人信息' : t === 'wardrobe' ? '我的衣库' : t === 'submissions' ? '我的投稿' : t === 'douyin' ? '抖音核销' : '穿搭画像'}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="me__section">
          <h3>头像与用户名</h3>
          <div className="me__profile-head">
            <label className="me__avatar-wrap" title="点击更换头像">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="me__avatar-input"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
                aria-label="上传头像"
              />
              {(() => {
                const u = avatarDisplayUrl || avatarUrl;
                const canLoad = u && !avatarImgError && (u.startsWith('http') || u.includes('/api/upload/avatar/') || (u.includes('/api/upload/access/') && u.includes('token=')));
                if (!canLoad) return (
                <span className="me__avatar-placeholder">
                  {nickname ? nickname.slice(0, 1) : '头'}
                </span>
                );
                const src = u.startsWith('http') ? u : (u.startsWith('/') ? `${window.location.origin}${u}` : `${window.location.origin}/${u}`);
                return (
                <img
                  key={u}
                  src={src}
                  alt="头像"
                  className="me__avatar-img"
                  onError={() => setAvatarImgError(true)}
                />
                );
              })()}
              {avatarUploading && <span className="me__avatar-loading">上传中...</span>}
              <span className="me__avatar-hint">点击更换头像</span>
            </label>
            <div className="me__profile-fields">
              <label className="me__row">
                <span className="me__label">用户名</span>
                <input
                  type="text"
                  className="me__input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="设置昵称"
                  maxLength={32}
                />
              </label>
              <div className="me__row">
                <span className="me__label">性别</span>
                <div className="me__option-group">
                  <label className="me__option">
                    <input type="radio" name="preferredGender" checked={preferredGender === '女'} onChange={() => setPreferredGender('女')} />
                    <span>女</span>
                  </label>
                  <label className="me__option">
                    <input type="radio" name="preferredGender" checked={preferredGender === '男'} onChange={() => setPreferredGender('男')} />
                    <span>男</span>
                  </label>
                </div>
              </div>
              <div className="me__row">
                <span className="me__label">年龄段</span>
                <div className="me__option-group">
                  {(['少年', '青年', '中年', '老年'] as const).map((age) => (
                    <label key={age} className="me__option">
                      <input type="radio" name="preferredAge" checked={preferredAge === age} onChange={() => setPreferredAge(age)} />
                      <span>{age}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="me__row">
                <span className="me__label">身份</span>
                <div className="me__option-group">
                  <label className="me__option">
                    <input type="radio" name="role" checked={role === 'user'} onChange={() => setRole('user')} />
                    <span>用户</span>
                  </label>
                  <label className="me__option">
                    <input type="radio" name="role" checked={role === 'merchant'} onChange={() => setRole('merchant')} />
                    <span>商家</span>
                  </label>
                </div>
              </div>
              {role === 'merchant' && user.role !== 'merchant' && (
                <>
                  <p className="me__hint me__hint--small">申请商家需先提交资质，审核通过后才会成为商家身份。</p>
                  <label className="me__row">
                    <span className="me__label">公司名称</span>
                    <input
                      type="text"
                      className="me__input"
                      value={merchantCompanyName}
                      onChange={(e) => setMerchantCompanyName(e.target.value)}
                      placeholder="请输入公司/店铺名称"
                      maxLength={100}
                    />
                  </label>
                  <label className="me__row">
                    <span className="me__label">资质编号</span>
                    <input
                      type="text"
                      className="me__input"
                      value={merchantLicenseNo}
                      onChange={(e) => setMerchantLicenseNo(e.target.value)}
                      placeholder="请输入营业执照/统一社会信用代码"
                      maxLength={100}
                    />
                  </label>
                </>
              )}
              {(merchantVerificationStatus === 'pending' || merchantVerificationStatus === 'rejected') && (
                <p className="me__hint me__hint--small">
                  商家资质状态：{merchantVerificationStatus === 'pending' ? '审核中' : '未通过，请补充资料后重新提交'}
                </p>
              )}
              <button
                type="button"
                className="me__btn me__btn--secondary"
                disabled={profileSaving}
                onClick={saveUserProfile}
              >
                {profileSaving ? '保存中...' : '确定'}
              </button>
            </div>
          </div>
          <h3>激励机制</h3>
          {incentives?.dailyQuota && (
            <div className="me__daily-quota">
              <span>今日试衣 {incentives.dailyQuota.tryonUsed}/{incentives.dailyQuota.tryonLimit} 次</span>
              <span>今日下载 {incentives.dailyQuota.downloadUsed}/{incentives.dailyQuota.downloadLimit} 次</span>
              <p className="me__incentive-desc">每日试衣和下载各 5 次免费，试衣生成每次仅消耗 1 次当日试衣次数（不扣账户积分），当日未用完次日清零。</p>
            </div>
          )}
          <div className="me__incentives">
            <div className="me__incentive-item">
              <IconEnergy />
              <div>
                <span className="me__incentive-value">时尚能量 {incentives?.energy ?? '--'}</span>
                <p className="me__incentive-desc">登录即加，下载试衣图每次 +10，用于后续权益兑换。</p>
              </div>
            </div>
            <div className="me__incentive-item">
              <IconStreak />
              <div>
                <span className="me__incentive-value">累计登录 {incentives?.streakDays ?? '--'} 天</span>
                <p className="me__incentive-desc">登录一次即加一次时尚能量，不要求连续。</p>
              </div>
            </div>
            <div className="me__incentive-item">
              <IconPoints />
              <div>
                <span className="me__incentive-value">积分 {incentives?.points ?? '--'}</span>
                <p className="me__incentive-desc">投稿搭配被采纳可获得积分，不会清零、可累积，用于积分解锁衣库中的指定搭配。</p>
              </div>
            </div>
          </div>
          {incentives?.recentPointLogs && incentives.recentPointLogs.length > 0 && (
            <>
              <h3>积分明细</h3>
              <ul className="me__list">
                {incentives.recentPointLogs.slice(0, 8).map((log) => (
                  <li key={log.id} className="me__list-item">
                    <span>{log.reason || '积分变动'}</span>
                    <span className="me__status">{log.change_amount > 0 ? `+${log.change_amount}` : `${log.change_amount}`}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3>会员</h3>
          {membershipActive ? (
            <>
              <p className="me__member-badge">
                您已是会员（{tierDisplayName(memberTier)}），当期内可免费解锁一定数量的「积分解锁」搭配（不扣积分）。
              </p>
              {memberExpiresAt && (
                <p className="me__hint me__hint--small">有效期至 {formatMemberDate(memberExpiresAt)}</p>
              )}
              <p className="me__hint me__hint--small">
                本期剩余免费解锁次数：<strong>{memberFreeUnlocks}</strong> 套
              </p>
            </>
          ) : (
            <>
              <p className="me__hint">开通会员后，当期内可免费解锁一定数量的「积分解锁」搭配（不扣积分），帮助你优先体验更多衣库内容。</p>
              <ul className="me__tiers">
                {MEMBERSHIP_TIERS.map((t) => (
                  <li key={t.id} className="me__tier">
                    <div className="me__tier-row">
                      <span className="me__tier-name">{t.name}</span>
                      <span className="me__tier-price">{t.priceLabel}</span>
                      <span className="me__tier-duration">（{t.duration}）</span>
                    </div>
                    <button
                      type="button"
                      className="me__btn me__btn--secondary me__tier-pay"
                      disabled={payLoadingTier !== null}
                      onClick={() => void startMembershipPay(t.id)}
                    >
                      {payLoadingTier === t.id
                        ? '处理中...'
                        : `去支付 ${t.priceLabel}`}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="me__hint me__hint--small">
                月卡 ¥10：当期额外 <strong>5 次</strong> 免费解锁；季卡 ¥35：<strong>15 次</strong>；年卡 ¥100：
                <strong>50 次</strong>。续费会在当前有效期上顺延，次数叠加。
              </p>
              <p className="me__hint me__hint--small">
                遇到问题可至 <Link to="/support">客服与帮助</Link>。
              </p>
            </>
          )}
          <p className="me__hint">试衣时可自由选择性别与身材类型，为自己或为他人选穿搭均可。</p>
        </div>
      )}

      {tab === 'submissions' && (
        <div className="me__section">
          <h3>我的投稿</h3>
          <p className="me__hint">投稿搭配图与描述，审核通过可获得积分。上传图片后填写描述并提交。</p>
          <SubmissionForm userId={user.userId} token={token} onSuccess={() => {
            fetch(`/api/submissions/my/${user.userId}`)
              .then((res) => res.json())
              .then((data) => setSubmissions(Array.isArray(data) ? data : []));
          }} />
          <ul className="me__list">
            {submissions.map((s: { id: number; image_url?: string; image_access_url?: string; description?: string; status: string }) => (
              <li key={s.id} className="me__list-item">
                {(s.image_access_url || s.image_url) && <img src={(s.image_access_url || s.image_url) as string} alt="" className="me__thumb" />}
                <span>{s.description || '无描述'}</span>
                <span className="me__status">{s.status === 'pending' ? '待审核' : s.status === 'accepted' ? '已采纳' : '已拒绝'}</span>
              </li>
            ))}
          </ul>
          {submissions.length === 0 && <p className="me__empty">暂无投稿</p>}
        </div>
      )}

      {tab === 'wardrobe' && (
        <div className="me__section">
          <h3>我的衣库</h3>
          <p className="me__hint">上传你已有的衣物图片，试衣页可直接选择「我的衣库」进行试穿。</p>
          <div className="me__form">
            <label className="me__btn me__btn--secondary">
              <input
                type="file"
                accept="image/*"
                disabled={wardrobeUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!token) {
                    setWardrobeUploadError('登录状态已失效，请重新登录后上传');
                    return;
                  }
                  setWardrobeUploadError('');
                  setWardrobeUploading(true);
                  try {
                    const quality = await checkImageQuality(file);
                    if (!quality.pass) {
                      setWardrobeUploadError(`图片未通过质量检测（评分 ${quality.score}/100）：${quality.issues.join('、') || '质量不足'}。请更换清晰图片后重试。`);
                      return;
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
                    if (!saveRes.ok) throw new Error(saveData.error || '保存失败');
                    await loadWardrobeItems();
                    setWardrobeUploadError('');
                  } catch (err) {
                    setWardrobeUploadError(err instanceof Error ? err.message : '上传失败，请稍后重试');
                  } finally {
                    setWardrobeUploading(false);
                    e.target.value = '';
                  }
                }}
              />
              {wardrobeUploading ? '上传中...' : '上传衣物'}
            </label>
          </div>
          {wardrobeUploadError && <p className="me__error">{wardrobeUploadError}</p>}
          <ul className="me__list">
            {wardrobeItems.map((item) => (
              <li key={item.id} className="me__list-item">
                <img src={item.image_url} alt={item.name || '我的衣物'} className="me__thumb" />
                <span>{item.name || `我的衣物-${item.id}`}</span>
                {wardrobeQualityMap[item.id] && (
                  <span className={wardrobeQualityMap[item.id].pass ? 'me__quality me__quality--good' : 'me__quality me__quality--bad'}>
                    质量 {wardrobeQualityMap[item.id].score}/100{wardrobeQualityMap[item.id].pass ? '' : '（建议重拍）'}
                  </span>
                )}
                <button
                  type="button"
                  className="me__btn me__btn--outline me__btn--small"
                  onClick={async () => {
                    if (!token) return;
                    const res = await fetch(`/api/wardrobe/${item.id}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) {
                      alert('删除失败，请稍后重试');
                      return;
                    }
                    await loadWardrobeItems();
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
          {wardrobeItems.length === 0 && <p className="me__empty">暂无衣物，点击上方上传</p>}
        </div>
      )}

      {tab === 'douyin' && (
        <div className="me__section">
          <h3>抖音核销</h3>
          <p className="me__hint">提交抖音链接或截图，点赞≥10 核验通过后可解锁指定搭配。</p>
          <p className="me__hint me__hint--small">等开发者有钱的时候，就改机制，提现☺</p>
          <DouyinClaimForm userId={user.userId} token={token} onSuccess={() => {
            fetch(`/api/douyin/claims/my/${user.userId}`)
              .then((res) => res.json())
              .then((data) => setClaims(Array.isArray(data) ? data : []));
          }} />
          <ul className="me__list">
            {claims.map((c: { id: number; link?: string; image_url?: string; status: string }) => (
              <li key={c.id} className="me__list-item">
                {c.link && <span className="me__link">{c.link}</span>}
                {c.image_url && <img src={c.image_url} alt="" className="me__thumb" />}
                <span className="me__status">{c.status === 'pending' ? '待核验' : c.status === 'approved' ? '已通过' : '已拒绝'}</span>
              </li>
            ))}
          </ul>
          {claims.length === 0 && <p className="me__empty">暂无核销记录</p>}
        </div>
      )}

      {tab === 'style' && (
        <div className="me__section">
          <h3>穿搭画像</h3>
          {styleProfile ? (
            <>
              <p className="me__summary">{styleProfile.summary}</p>
              {styleProfile.topStyleTags?.length > 0 && (
                <p className="me__tags">常选风格：{styleProfile.topStyleTags.map((t) => t.name).join('、')}</p>
              )}
              {styleProfile.topStyleTags?.length >= 3 && (
                <StyleRadarChart
                  data={(() => {
                    const points = styleProfile.topStyleTags.slice(0, 5);
                    const maxCount = Math.max(...points.map((p) => p.count), 1);
                    return points.map((p) => ({
                      label: p.name,
                      value: p.count / maxCount,
                    }));
                  })()}
                />
              )}
              <p className="me__hint">共 {styleProfile.totalRecords} 条穿搭记录</p>
              {styleProfile.recentItems && styleProfile.recentItems.length > 0 && (
                <>
                  <p className="me__hint me__hint--small">近期记录（试衣效果图与官方搭配图）</p>
                  <ul className="me__style-grid">
                    {styleProfile.recentItems.map((item, idx) => (
                      <li key={`${item.kind}-${idx}-${item.name}`} className="me__style-card">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="me__style-img" loading="lazy" />
                        ) : (
                          <div className="me__style-placeholder" aria-hidden>
                            无图
                          </div>
                        )}
                        <span className="me__style-caption" title={item.name}>
                          {item.kind === 'wardrobe' ? '我的衣库 · ' : ''}
                          {item.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="me__empty">加载中或暂无数据</p>
          )}
        </div>
      )}

      <div className="me__footer">
        <button type="button" className="me__btn me__btn--outline" onClick={() => logout()}>
          退出登录
        </button>
      </div>
    </div>
  );
}

function SubmissionForm({ userId, token, onSuccess }: { userId: number; token: string | null; onSuccess: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const submit = async () => {
    let url = imageUrl;
    if (imageFile && (!url || url.startsWith('blob:'))) {
      const form = new FormData();
      form.append('photo', imageFile);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/upload/photo', { method: 'POST', headers, body: form });
      const data = await res.json();
      if (!res.ok) return;
      url = data.photo_url;
    }
    if (!url) {
      alert('请先上传搭配图');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, image_url: url, description: description || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '提交失败');
      setDescription('');
      setImageUrl(null);
      setImageFile(null);
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="me__form">
      <label className="me__upload">
        <input type="file" accept="image/*" onChange={onFile} />
        {imageUrl ? <img src={imageUrl} alt="" className="me__preview" /> : '上传搭配图'}
      </label>
      <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述（选填）" className="me__input" />
      <button type="button" className="me__btn" disabled={submitting} onClick={submit}>提交投稿</button>
    </div>
  );
}

function DouyinClaimForm({ userId, token, onSuccess }: { userId: number; token: string | null; onSuccess: () => void }) {
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const submit = async () => {
    let finalImageUrl: string | null = null;
    if (imageFile) {
      const form = new FormData();
      form.append('photo', imageFile);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/upload/photo', { method: 'POST', headers, body: form });
      const data = await res.json();
      if (!res.ok) return;
      finalImageUrl = data.photo_url;
    }
    if (!link && !finalImageUrl) {
      alert('请填写抖音链接或上传截图');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/douyin/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, link: link || undefined, imageUrl: finalImageUrl ?? undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '提交失败');
      setLink('');
      setImageUrl(null);
      setImageFile(null);
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="me__form">
      <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="抖音链接（选填）" className="me__input" />
      <label className="me__upload">
        <input type="file" accept="image/*" onChange={onFile} />
        {imageUrl ? <img src={imageUrl} alt="" className="me__preview" /> : '上传截图（选填）'}
      </label>
      <button type="button" className="me__btn" disabled={submitting} onClick={submit}>提交核销</button>
    </div>
  );
}
