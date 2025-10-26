import React, { useEffect, useMemo, useRef, useState } from 'react';

const typeColors = {
  warning: 'bg-amber-400',
  error: 'bg-red-500',
  info: 'bg-sky-400',
  success: 'bg-emerald-400',
};

const DEFAULT_TYPE_COLOR = 'bg-slate-500';

const getRelativeTimeFromNow = (isoDate) => {
  if (!isoDate) {
    return '';
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return "à l'instant";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `il y a ${diffMinutes} min${diffMinutes > 1 ? 's' : ''}`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `il y a ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `il y a ${diffDays} j`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) {
    return `il y a ${diffWeeks} sem.`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `il y a ${diffMonths} mois`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `il y a ${diffYears} an${diffYears > 1 ? 's' : ''}`;
};

export default function NotificationsPanel({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  anchorRef,
}) {
  const panelRef = useRef(null);
  const overlayRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({});
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth >= 768;
  });

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && panelRef.current) {
      const timer = requestAnimationFrame(() => {
        panelRef.current?.focus();
      });

      return () => cancelAnimationFrame(timer);
    }

    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const updateDesktopState = () => {
      if (typeof window === 'undefined') {
        return;
      }
      setIsDesktop(window.innerWidth >= 768);
    };

    const updatePosition = () => {
      if (!anchorRef?.current || typeof window === 'undefined') {
        setPanelStyle({});
        return;
      }

      const rect = anchorRef.current.getBoundingClientRect();
      const top = Math.max(rect.bottom + 8, 16);
      const left = Math.max(rect.left - 4, 16);

      setPanelStyle({
        top,
        left,
      });
    };

    updateDesktopState();
    updatePosition();

    window.addEventListener('resize', updateDesktopState);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updateDesktopState);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, isOpen]);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read),
    [notifications],
  );

  const handleOverlayClick = (event) => {
    if (event.target === overlayRef.current) {
      onClose?.();
    }
  };

  if (!isOpen) {
    return null;
  }

  const computedStyle = isDesktop && panelStyle.top != null && panelStyle.left != null
    ? { top: panelStyle.top, left: panelStyle.left }
    : undefined;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 px-4 py-6 md:justify-start md:bg-transparent md:px-0 md:py-0"
      aria-hidden={!isOpen}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        tabIndex={-1}
        className={`mt-14 w-full max-w-xl rounded-t-3xl border border-white/10 bg-slate-900 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:mt-0 md:max-w-sm md:rounded-2xl ${
          isDesktop ? 'md:fixed md:w-80' : ''
        }`}
        style={computedStyle}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-100">Notifications</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Fermer le panneau de notifications"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-3 md:max-h-96">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">
              Aucune notification pour le moment.
            </p>
          ) : (
            <ul className="space-y-2">
              {notifications.map((notification) => {
                const typeColor = typeColors[notification.type] || DEFAULT_TYPE_COLOR;
                const relativeTime = getRelativeTimeFromNow(notification.createdAt);

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={`group flex w-full flex-col items-start gap-1 rounded-lg border border-white/10 bg-slate-800/70 px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:bg-slate-800 ${
                        notification.read ? 'opacity-80' : 'shadow-inner'
                      }`}
                    >
                      <div className="flex w-full items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 h-2.5 w-2.5 rounded-full ${typeColor}`}
                        />
                        <p className="flex-1 text-sm font-semibold text-slate-100">
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="ml-2 h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" />
                        )}
                      </div>
                      {notification.message && (
                        <p className="text-sm text-slate-300">{notification.message}</p>
                      )}
                      <div className="flex w-full items-center justify-end">
                        <span className="text-xs text-slate-400">{relativeTime}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              if (unreadNotifications.length > 0) {
                onMarkAllAsRead?.(unreadNotifications.map((notification) => notification.id));
              }
            }}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            disabled={unreadNotifications.length === 0}
          >
            Tout marquer comme lu
          </button>
        </div>
      </div>
    </div>
  );
}
