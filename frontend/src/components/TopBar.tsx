import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoginModal from './LoginModal';
import { IconEnergy, IconStreak, IconPoints } from './IncentiveIcons';
import './TopBar.css';

interface Incentives {
  points: number;
  energy: number;
  streakDays: number;
}

interface UserProfile {
  nickname: string;
  avatar_url: string;
}

function getCurrentSeasonTag(): '春' | '夏' | '秋' | '冬' {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

/** 顶栏「X季精选」仅改展示字。夏季成衣尚不足时先标「夏」，搭配与衣库仍沿用现有数据；恢复按日历季时改为 null。 */
const TOPBAR_SEASON_CHIP_OVERRIDE: '春' | '夏' | '秋' | '冬' | null = '夏';

export default function TopBar() {
  const { user, logout, isAuthenticated, token } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [incentives, setIncentives] = useState<Incentives | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const seasonTag = TOPBAR_SEASON_CHIP_OVERRIDE ?? getCurrentSeasonTag();

  useEffect(() => {
    if (!user?.userId) {
      setUserProfile(null);
      return;
    }
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(`/api/users/${user.userId}/profile`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          // 头像使用公开展示 URL（头像不做隐私保护），无需 token
          const displayUrl = data.avatar_display_url || data.avatar_url || '';
          setUserProfile({ nickname: data.nickname ?? '', avatar_url: displayUrl });
          setAvatarLoadFailed(false);
        } else setUserProfile(null);
      })
      .catch(() => setUserProfile(null));
  }, [user?.userId, token]);

  useEffect(() => {
    if (!user?.userId) {
      setIncentives(null);
      return;
    }
    fetch(`/api/incentives/${user.userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data != null && typeof data === 'object') {
          setIncentives({
            points: Number(data.points) || 0,
            energy: Number(data.energy) || 0,
            streakDays: Number(data.streakDays) || 0,
          });
        } else {
          setIncentives(null);
        }
      })
      .catch(() => setIncentives(null));
  }, [user?.userId]);

  return (
    <>
      <header className="topbar">
        <Link to="/home" className="topbar__logo">
          Zchoose
        </Link>
        <span className="topbar__season-chip" aria-label={`当季：${seasonTag}季`}>
          {seasonTag}季精选
        </span>
        <div className="topbar__right">
          {isAuthenticated && incentives != null && (
            <div className="topbar__incentives">
              <span className="topbar__stat">
                <IconEnergy />
                <span className="topbar__stat-label">时尚能量</span>
                <span className="topbar__stat-value">{incentives.energy}</span>
              </span>
              <span className="topbar__stat">
                <IconStreak />
                <span className="topbar__stat-label">累计登录</span>
                <span className="topbar__stat-value">{incentives.streakDays}天</span>
              </span>
              <span className="topbar__stat">
                <IconPoints />
                <span className="topbar__stat-label">积分</span>
                <span className="topbar__stat-value">{incentives.points}</span>
              </span>
            </div>
          )}
          {isAuthenticated ? (
            <div className="topbar__user-wrap">
              {userProfile?.avatar_url && !avatarLoadFailed && (userProfile.avatar_url.startsWith('http') || userProfile.avatar_url.includes('/api/upload/avatar/') || (userProfile.avatar_url.includes('/api/upload/access/') && userProfile.avatar_url.includes('token='))) ? (
                <img
                  src={userProfile.avatar_url.startsWith('http') ? userProfile.avatar_url : `${window.location.origin}${userProfile.avatar_url.startsWith('/') ? '' : '/'}${userProfile.avatar_url}`}
                  alt=""
                  className="topbar__avatar"
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <span className="topbar__avatar topbar__avatar--placeholder">
                  {(userProfile?.nickname?.trim() || '我').slice(0, 1)}
                </span>
              )}
              <span className="topbar__username">{userProfile?.nickname?.trim() || '未设置昵称'}</span>
              <button type="button" className="topbar__user" onClick={logout}>
                退出
              </button>
            </div>
          ) : (
            <button type="button" className="topbar__user" onClick={() => setShowLogin(true)}>
              登录
            </button>
          )}
        </div>
      </header>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
