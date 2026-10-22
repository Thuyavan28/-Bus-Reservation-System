import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Entry from './pages/Entry';
import Home from './pages/Home';
import { useAuth } from './store/auth';

// route-level code splitting: each screen is fetched when first visited
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const ForgotPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ResetPassword })));
const Signup = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Signup })));
const Operator = lazy(() => import('./pages/Operator'));
const Passengers = lazy(() => import('./pages/Passengers'));
const Payment = lazy(() => import('./pages/Payment'));
const PaymentApprove = lazy(() => import('./pages/PaymentApprove'));
const PaymentReturn = lazy(() => import('./pages/Payment').then((m) => ({ default: m.PaymentReturn })));
const Points = lazy(() => import('./pages/Points'));
const Profile = lazy(() => import('./pages/Profile'));
const Results = lazy(() => import('./pages/Results'));
const Seats = lazy(() => import('./pages/Seats'));
const Ticket = lazy(() => import('./pages/Ticket'));
const TicketVerify = lazy(() => import('./pages/TicketVerify'));
const Track = lazy(() => import('./pages/Track'));
const TrackIndex = lazy(() => import('./pages/Track').then((m) => ({ default: m.TrackIndex })));
const Trips = lazy(() => import('./pages/Trips'));
const Cancel = lazy(() => import('./pages/Trips').then((m) => ({ default: m.Cancel })));
const Welcome = lazy(() => import('./pages/Welcome'));

import { ErrorBoundary } from './components/states/ErrorBoundary';
import { ConnectivityBanner } from './components/states/NoInternetState';
import { DevStateSwitcher } from './components/states/DevStateSwitcher';

const guard = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  return (
    <ErrorBoundary>
      <ConnectivityBanner />
      <Routes>
        <Route path="/" element={<Entry />} />
      {/* opened by scanning the payment QR: public, the token is the credential */}
      <Route path="/pay/approve/:token" element={<Suspense fallback={null}><PaymentApprove /></Suspense>} />
      {/* opened by scanning the boarding pass / ticket QR: public, PNR is the verification key */}
      <Route path="/ticket/verify/:pnr" element={<Suspense fallback={null}><TicketVerify /></Suspense>} />
      {/* full-page auth screens (no site navbar) */}
      <Route path="/login" element={<Suspense fallback={null}><Login /></Suspense>} />
      <Route path="/forgot-password" element={<Suspense fallback={null}><ForgotPassword /></Suspense>} />
      <Route path="/reset-password/:token" element={<Suspense fallback={null}><ResetPassword /></Suspense>} />
      <Route path="/signup" element={<Suspense fallback={null}><Signup /></Suspense>} />
      <Route path="/welcome" element={<Suspense fallback={null}><Welcome /></Suspense>} />
      <Route element={<Layout />}>
        <Route path="/home" element={<Home />} />
        {/* guests may search; the seat page needs a login */}
        <Route path="/search" element={<Results />} />
        <Route path="/trip/:id/seats" element={guard(<Seats />)} />
        {/* booking requires login */}
        <Route path="/trip/:id/points" element={guard(<Points />)} />
        <Route path="/trip/:id/passengers" element={guard(<Passengers />)} />
        <Route path="/payment/:bookingId" element={guard(<Payment />)} />
        <Route path="/payment/return" element={guard(<PaymentReturn />)} />
        <Route path="/booking/:id" element={guard(<Ticket />)} />
        <Route path="/trips" element={guard(<Trips />)} />
        <Route path="/trips/:id/cancel" element={guard(<Cancel />)} />
        <Route path="/track" element={guard(<TrackIndex />)} />
        <Route path="/track/:bookingId" element={guard(<Track />)} />
        <Route path="/profile" element={guard(<Profile />)} />
        <Route path="/operator" element={<RequireAuth roles={['operator', 'admin']}><Operator /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
    <DevStateSwitcher />
  </ErrorBoundary>
  );
}
