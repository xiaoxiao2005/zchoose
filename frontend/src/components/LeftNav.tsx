import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LeftNav.css';

const ITEMS = [
  { to: '/home', label: '大厅' },
  { to: '/outfits', label: '衣库' },
  { to: '/resale', label: '闲置' },
  { to: '/recommend', label: '快速穿搭' },
  { to: '/tryon', label: '试衣' },
  { to: '/merchant-slots', label: '商家入驻' },
  { to: '/submission-review', label: '审核' },
  { to: '/support-review', label: '客服单' },
  { to: '/support', label: '客服' },
  { to: '/me', label: '我的' },
] as const;

export default function LeftNav() {
  const { user } = useAuth();
  const isReviewer = user?.phone === '17308112541';
  const isMerchant = user?.role === 'merchant';
  const items = ITEMS.filter((item) => {
    if ((item.to === '/submission-review' || item.to === '/support-review') && !isReviewer) return false;
    if (item.to === '/merchant-slots' && !isMerchant) return false;
    return true;
  });

  return (
    <nav className="leftnav" aria-label="主导航">
      {items.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `leftnav__item ${isActive ? 'leftnav__item--active' : ''}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
