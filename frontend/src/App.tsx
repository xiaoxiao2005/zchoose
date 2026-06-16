import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Splash from './pages/Splash';
import Home from './pages/Home';
import Outfits from './pages/Outfits';
import ResaleMarket from './pages/ResaleMarket';
import ResalePublish from './pages/ResalePublish';
import TryOn from './pages/TryOn';
import Recommend from './pages/Recommend';
import Support from './pages/Support';
import Me from './pages/Me';
import MerchantSlots from './pages/MerchantSlots';
import PrivacyPolicy from './pages/PrivacyPolicy';
import SubmissionReview from './pages/SubmissionReview';
import SupportReview from './pages/SupportReview';
import AdminTagCorrection from './pages/AdminTagCorrection';

export default function App() {
  const { user, isAuthenticated } = useAuth();
  const isReviewer = user?.phone === '17308112541';
  const isMerchant = user?.role === 'merchant';

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/splash" replace />} />
      <Route path="/splash" element={<Splash />} />
      <Route element={<Layout />}>
        <Route path="home" element={<Home />} />
        <Route path="privacy" element={<PrivacyPolicy />} />
        <Route path="outfits" element={<Outfits />} />
        <Route path="resale" element={<ResaleMarket />} />
        <Route path="resale/new" element={<ResalePublish />} />
        <Route path="merchant-slots" element={isMerchant ? <MerchantSlots /> : <Navigate to="/home" replace />} />
        <Route path="recommend" element={<Recommend />} />
        <Route path="tryon" element={<TryOn />} />
        <Route path="support" element={<Support />} />
        <Route path="me" element={<Me />} />
        <Route path="submission-review" element={isReviewer ? <SubmissionReview /> : <Navigate to="/home" replace />} />
        <Route path="support-review" element={isReviewer ? <SupportReview /> : <Navigate to="/home" replace />} />
        <Route
          path="admin/tag-correction"
          element={isAuthenticated ? <AdminTagCorrection /> : <Navigate to="/home" replace />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
