import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rooms from './pages/Rooms.jsx';
import Orders from './pages/Orders.jsx';
import TuckShop from './pages/TuckShop.jsx';
import Kitchen from './pages/Kitchen.jsx';
import Stock from './pages/Stock.jsx';
import Recon from './pages/Recon.jsx';
import Reports from './pages/Reports.jsx';
import Alerts from './pages/Alerts.jsx';
import Users from './pages/Users.jsx';
import Menu from './pages/Menu.jsx';
import Audit from './pages/Audit.jsx';
import Petty from './pages/Petty.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Which nav entries each role sees (mirrors API permissions - design 2.2)
const NAV = [
  { to: '/dashboard', label: 'Dashboard', roles: ['owner', 'office_manager', 'facility_manager'] },
  { to: '/rooms', label: 'Guest House', roles: ['owner', 'office_manager', 'facility_manager', 'reception'] },
  { to: '/orders', label: 'Restaurant', roles: ['owner', 'office_manager', 'facility_manager', 'waiter', 'shop_attendant'] },
  { to: '/tuckshop', label: 'Tuck Shop', roles: ['owner', 'office_manager', 'facility_manager', 'shop_attendant'] },
  { to: '/kitchen', label: 'Kitchen', roles: ['owner', 'office_manager', 'facility_manager', 'kitchen'] },
  { to: '/stock', label: 'Stock', roles: ['owner', 'office_manager', 'facility_manager'] },
  { to: '/menu', label: 'Menu & Prices', roles: ['owner'] },
  { to: '/recon', label: 'End of Day', roles: ['owner', 'office_manager', 'facility_manager'] },
  { to: '/reports', label: 'Reports', roles: ['owner', 'office_manager'] },
  { to: '/audit', label: 'Audit Log', roles: ['owner', 'office_manager'] },
  { to: '/alerts', label: 'Alerts', roles: ['owner', 'office_manager', 'facility_manager'] },
  { to: '/users', label: 'Users', roles: ['owner'] },
  { to: '/petty', label: 'Petty Cash', roles: ['owner', 'office_manager', 'facility_manager'] },
];

function Layout({ children }) {
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const nav = NAV.filter((n) => n.roles.includes(user.role));
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="layout">
      <header className="topbar">
        <button className="hamburger" aria-label="Open menu" onClick={() => setNavOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="brand">EZOLA<span>BMS</span></div>
        <div className="avatar" title={`${user.name} · ${user.role.replace('_', ' ')}`}>{initials}</div>
      </header>

      <div className={`scrim ${navOpen ? 'show' : ''}`} onClick={() => setNavOpen(false)} />

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">LES<span>BMS</span></div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setNavOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          <div className="uname">{user.name}</div>
          <div className="urole">{user.role.replace('_', ' ')}</div>
          <button className="btn ghost sm" onClick={logout}>Switch user</button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const navigate = useNavigate();

  useEffect(() => {
    api('/api/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const login = (u) => { setUser(u); navigate(defaultRoute(u.role)); };
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); setUser(null); navigate('/login'); };

  if (user === undefined) return <div className="loading">Loading…</div>;

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={defaultRoute(user.role)} /> : <Login />} />
        {user ? (
          <>
            <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
            <Route path="/rooms" element={<Layout><Rooms /></Layout>} />
            <Route path="/orders" element={<Layout><Orders /></Layout>} />
            <Route path="/tuckshop" element={<Layout><TuckShop /></Layout>} />
            <Route path="/kitchen" element={<Layout><Kitchen /></Layout>} />
            <Route path="/stock" element={<Layout><Stock /></Layout>} />
            <Route path="/recon" element={<Layout><Recon /></Layout>} />
            <Route path="/reports" element={<Layout><Reports /></Layout>} />
            <Route path="/audit" element={<Layout><Audit /></Layout>} />
            <Route path="/alerts" element={<Layout><Alerts /></Layout>} />
            <Route path="/users" element={<Layout><Users /></Layout>} />
            <Route path="/petty" element={<Layout><Petty /></Layout>} />
            <Route path="*" element={<Navigate to={defaultRoute(user.role)} />} />
            <Route path="/menu" element={<Layout><Menu /></Layout>} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" />} />
        )}
      </Routes>
    </AuthCtx.Provider>
  );
}

function defaultRoute(role) {
  switch (role) {
    case 'reception': return '/rooms';
    case 'waiter': return '/orders';
    case 'shop_attendant': return '/tuckshop';
    case 'kitchen': return '/kitchen';
    default: return '/dashboard';
  }
}
