import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { Layout } from './components/Layout';
import { Loading } from './components/common';
import { DashboardPage } from './pages/DashboardPage';
import { AlertsPage } from './pages/AlertsPage';
import { CampsPage } from './pages/CampsPage';
import { WalkInsPage } from './pages/WalkInsPage';
import { RolesPage } from './pages/admin/RolesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AddressPage } from './pages/admin/AddressPage';
import { FacilitiesPage } from './pages/admin/FacilitiesPage';
import { MastersPage } from './pages/admin/MastersPage';
import { EventsPage } from './pages/admin/EventsPage';

export function App() {
  const { status, canAny } = useAuth();

  if (status === 'loading') return <Loading label="Restoring your session…" />;
  if (status === 'signed-out') return <LoginPage />;

  // A user whose role has no dashboard permission lands on the first page they
  // can actually open, rather than an empty dashboard they cannot read.
  const home = canAny('dashboard.view') ? <DashboardPage /> : <Navigate to="/camps" replace />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={home} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/camps" element={<CampsPage />} />
        <Route path="/walk-ins" element={<WalkInsPage />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/roles" element={<RolesPage />} />
        <Route path="/admin/address" element={<AddressPage />} />
        <Route path="/admin/facilities" element={<FacilitiesPage />} />
        <Route path="/admin/masters" element={<MastersPage />} />
        <Route path="/admin/events" element={<EventsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
