import { useState, useEffect, useCallback, useRef } from 'react';
import { registerDispatch } from '../utils/notifications.js';

const COLORS = {
  success: { border: '#2e7d32', icon: '#66bb6a' },
  error:   { border: '#c62828', icon: '#ef9a9a' },
  warning: { border: '#e65100', icon: '#ffb74d' },
  info:    { border: '#3a5acd', icon: '#7ca8ff' },
};

export default function Notifications() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const dispatch = useCallback((toast) => {
    if (toast.__dismiss !== undefined) { removeToast(toast.__dismiss); return; }
    setToasts(prev => {
      if (prev.find(t => t.message === toast.message && t.title === toast.title)) return prev;
      return [...prev, toast];
    });
    if (!toast.sticky && toast.duration !== 0) {
      timers.current[toast.id] = setTimeout(() => removeToast(toast.id), toast.duration || 3500);
    }
  }, [removeToast]);

  useEffect(() => { registerDispatch(dispatch); }, [dispatch]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none', maxWidth: 380,
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info;
        return (
          <div key={t.id} style={{
            background: 'rgba(14,16,48,0.97)',
            border: `1px solid ${c.border}`,
            borderRadius: 13, padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            minWidth: 270, maxWidth: 380,
            boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
            animation: 'slideIn .3s cubic-bezier(.4,0,.2,1)',
            pointerEvents: 'all',
          }}>
            {t.sticky ? (
              <div style={{
                width: 16, height: 16, flexShrink: 0, marginTop: 2,
                borderRadius: '50%',
                border: `2px solid ${c.icon}44`,
                borderTopColor: c.icon,
                animation: 'spin 1s linear infinite',
              }} />
            ) : (
              <span style={{ color: c.icon, fontSize: 15, fontWeight: 700, marginTop: 1, flexShrink: 0 }}>●</span>
            )}
            <div style={{ flex: 1 }}>
              {t.title && <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 2, fontFamily: 'Nunito' }}>{t.title}</div>}
              <div style={{ color: 'rgba(200,220,255,0.9)', fontSize: 13, fontFamily: 'Nunito' }}>{t.message}</div>
            </div>
            <button onClick={() => removeToast(t.id)} style={{
              background: 'none', border: 'none', color: 'rgba(180,200,255,0.4)',
              cursor: 'pointer', fontSize: 16, padding: 0,
            }}>×</button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideIn { from{transform:translateX(18px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
