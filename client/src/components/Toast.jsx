import React, { createContext, useCallback, useContext, useState } from 'react';

// Lightweight toast system - no dependencies.
// usage: const toast = useToast(); toast('Saved', 'success'); toast('Walk R65...', 'warn', 9000);
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message, type = 'info', duration = 5000) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
            <span className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'warn' ? '!' : t.type === 'error' ? '×' : 'i'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}