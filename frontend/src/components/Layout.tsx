import { Outlet, Link } from 'react-router-dom';
import TopBar from './TopBar';
import LeftNav from './LeftNav';
import BottomNav from './BottomNav';
import './Layout.css';

export default function Layout() {
  return (
    <div className="layout">
      <TopBar />
      <div className="layout__body">
        <LeftNav />
        <main className="layout__main">
          <Outlet />
        </main>
      </div>
      <footer className="layout__footer">
        <Link to="/privacy" className="layout__footer-link">
          隐私政策
        </Link>
      </footer>
      <BottomNav />
    </div>
  );
}
