import { NavLink } from 'react-router-dom';
import './BottomNav.css';

const ITEMS = [
  { to: '/home', label: '首页' },
  { to: '/outfits', label: '衣库' },
  { to: '/resale', label: '闲置' },
  { to: '/recommend', label: '快速穿搭' },
  { to: '/support', label: '客服' },
  { to: '/me', label: '我的' },
] as const;

export default function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="底部导航">
      {ITEMS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottomnav__item ${isActive ? 'bottomnav__item--active' : ''}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
