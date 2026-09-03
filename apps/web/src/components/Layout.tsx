import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PERMISSIONS } from '@mgms/shared';

interface NavItem {
  to: string;
  label: string;
  /** Any one of these permissions reveals the item. */
  permissions: string[];
}

const OPERATIONS: NavItem[] = [
  { to: '/', label: 'Live dashboard', permissions: [PERMISSIONS.DASHBOARD_VIEW] },
  { to: '/alerts', label: 'Alerts', permissions: [PERMISSIONS.ALERT_READ] },
  { to: '/camps', label: 'Camps', permissions: [PERMISSIONS.CAMP_READ] },
  { to: '/walk-ins', label: 'Walk-ins', permissions: [PERMISSIONS.WALKIN_READ] },
];

const ADMIN: NavItem[] = [
  { to: '/admin/users', label: 'Users', permissions: [PERMISSIONS.USER_READ] },
  { to: '/admin/roles', label: 'Roles & permissions', permissions: [PERMISSIONS.ROLE_READ] },
  { to: '/admin/address', label: 'Address hierarchy', permissions: [PERMISSIONS.ADDRESS_READ] },
  { to: '/admin/facilities', label: 'Facilities', permissions: [PERMISSIONS.FACILITY_READ] },
  { to: '/admin/masters', label: 'Masters', permissions: [PERMISSIONS.MASTER_READ] },
  { to: '/admin/events', label: 'Events & zones', permissions: [PERMISSIONS.EVENT_READ] },
];

type Theme = 'light' | 'dark' | 'system';

export function Layout() {
  const { session, signOut, canAny } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('mgms.theme') as Theme) ?? 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    localStorage.setItem('mgms.theme', theme);
  }, [theme]);

  const operations = OPERATIONS.filter((item) => canAny(...item.permissions));
  const admin = ADMIN.filter((item) => canAny(...item.permissions));

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>

      <nav className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark">MGMS</div>
          <div className="brand-sub">Mass Gathering Health</div>
        </div>

        {operations.length > 0 && <div className="nav-group">Operations</div>}
        {operations.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="dot" aria-hidden />
            {item.label}
          </NavLink>
        ))}

        {admin.length > 0 && <div className="nav-group">Admin console</div>}
        {admin.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="dot" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="main">
        <header className="topbar">
          <div>
            <div style={{ fontWeight: 600 }}>{session?.fullName}</div>
            <div className="tiny muted">
              {session?.roleName} · {scopeSummary(session)}
            </div>
          </div>

          <div className="row">
            <select
              className="select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              aria-label="Colour theme"
            >
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button className="btn" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function scopeSummary(session: ReturnType<typeof useAuth>['session']): string {
  if (!session) return '';
  const { scope } = session;
  if (scope.level === 'STATE') return 'State-wide access';
  const parts: string[] = [];
  if (scope.districtIds.length) parts.push(`${scope.districtIds.length} district(s)`);
  if (scope.campIds.length) parts.push(`${scope.campIds.length} camp(s)`);
  return parts.length > 0 ? parts.join(' · ') : 'No area assigned';
}
