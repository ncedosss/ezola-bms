import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Website from './site/Website.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './styles.css';

// The staff system (with its charts) only downloads when a staff page is opened,
// so the public website stays light on mobile data.
const App = lazy(() => import('./App.jsx'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ToastProvider>
      <Routes>
        {/* Public marketing website */}
        <Route path="/" element={<Website />} />
        {/* Staff business management system (login, dashboard, rooms, kitchen, …) */}
        <Route
          path="/*"
          element={
            <Suspense fallback={<div className="loading">Loading…</div>}>
              <App />
            </Suspense>
          }
        />
      </Routes>
    </ToastProvider>
  </BrowserRouter>
);
