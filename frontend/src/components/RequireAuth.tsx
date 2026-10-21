import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@busgo/shared';
import { useAuth } from '../store/auth';
import { Spinner } from './ui';
import { PermissionDeniedState } from './states/PermissionDeniedState';

/** Booking and account pages need a login; guests can only search and view seats. */
export default function RequireAuth({ children, roles }: { children: JSX.Element; roles?: Role[] }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="py-12">
        <PermissionDeniedState
          kind="account-role"
          onSafeReturn={() => window.history.back()}
          fallbackLabel="Go Back to Home"
        />
      </div>
    );
  }
  return children;
}
