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
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth >= 768;
  });

  useEffect(() => {
    const updateDesktopState = () => {
      if (typeof window === 'undefined') {
        return;
      }
      setIsDesktop(window.innerWidth >= 768);
    };

    updateDesktopState();
    window.addEventListener('resize', updateDesktopState);

    return () => {
      window.removeEventListener('resize', updateDesktopState);
    };
  }, []);

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
    if (!isOpen || !isDesktop) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (panelRef.current?.contains(target)) {
        return;
      }
      if (anchorRef?.current?.contains?.(target)) {
        return;
      }
      onClose?.();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [anchorRef, isDesktop, isOpen, onClose]);

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

  const markAll = () => {
    if (unreadNotifications.length > 0) {
      onMarkAllAsRead?.(unreadNotifications.map((notification) => notification.id));
    }
  };

  const panelHeader = (
    <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-4">
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
  );

  const panelBody = (
    <div className={`${isDesktop ? 'max-h-96' : 'flex-1'} overflow-y-auto px-2 py-3`}>
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
                  className={`group flex w-full flex-col items-start gap-1 rounded-lg border border-slate-700/70 bg-slate-800/70 px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:bg-slate-800 ${
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
  );

  const panelFooter = (
    <div className="border-t border-slate-700/70 px-5 py-4">
      <button
        type="button"
        onClick={markAll}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        disabled={unreadNotifications.length === 0}
      >
        Tout marquer comme lu
      </button>
    </div>
  );

  const desktopPanel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={false}
      aria-label="Notifications"
      tabIndex={-1}
      className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      {panelHeader}
      {panelBody}
      {panelFooter}
    </div>
  );

  const mobilePanel = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 px-4 py-6"
      aria-hidden={!isOpen}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label="Notifications"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {panelHeader}
        {panelBody}
        {panelFooter}
      </div>
    </div>
  );

  return isDesktop ? desktopPanel : mobilePanel;
}
