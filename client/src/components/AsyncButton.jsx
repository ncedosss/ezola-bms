import React, { useState, useRef, useEffect } from 'react';

// Drop-in replacement for <button> on any action that calls the server.
// While its onClick promise is running, the button is disabled and shows a
// spinner, so a user can't fire it twice. Re-entry is blocked synchronously
// via a ref, which also stops a rapid double-tap that beats the re-render.
export default function AsyncButton({ onClick, children, disabled = false, busyLabel, className = '', ...rest }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const handle = async (e) => {
    if (lock.current || busy || disabled || !onClick) return; // guard double-fire
    lock.current = true;
    setBusy(true);
    try {
      await onClick(e);            // works whether onClick is async or sync
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false); // component may have unmounted (modal closed)
    }
  };

  return (
    <button
      type="button"
      className={`${className}${busy ? ' busy' : ''}`}
      onClick={handle}
      disabled={disabled || busy}
      aria-busy={busy}
      {...rest}
    >
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      <span>{busy && busyLabel ? busyLabel : children}</span>
    </button>
  );
}
