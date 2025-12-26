import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Trash2, ExternalLink, X } from 'lucide-react';
import { getNotificationIcon, getNotificationColors } from '../utils/notificationIcons';

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
  onMarkAsRead,
  onDelete,
  onNotificationClick,
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

  const [filter, setFilter] = useState('all');

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

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') {
      return notifications;
    }
    if (filter === 'unread') {
      return unreadNotifications;
    }
    return notifications.filter((n) => n.type === filter);
  }, [notifications, unreadNotifications, filter]);

  const notificationTypes = useMemo(() => {
    const types = new Set();
    notifications.forEach((n) => {
      if (n.type) {
        types.add(n.type);
      }
    });
    return Array.from(types);
  }, [notifications]);

  const handleOverlayClick = (event) => {
    if (event.target === overlayRef.current) {
      onClose?.();
    }
  };

  const handleMarkAsRead = (e, notificationId) => {
    e.stopPropagation();
    onMarkAsRead?.(notificationId);
  };

  const handleDelete = (e, notificationId) => {
    e.stopPropagation();
    onDelete?.(notificationId);
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      onMarkAsRead?.(notification.id);
    }
    onNotificationClick?.(notification);
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
    <div className="flex flex-col gap-3 border-b border-slate-700/70 px-5 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Notifications</h2>
          {unreadNotifications.length > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {unreadNotifications.length} non lue{unreadNotifications.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Fermer le panneau de notifications"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {notifications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
          >
            Toutes ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === 'unread'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
          >
            Non lues ({unreadNotifications.length})
          </button>
          {notificationTypes.map((type) => {
            const count = notifications.filter((n) => n.type === type).length;
            const colors = getNotificationColors(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => setFilter(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === type
                    ? 'bg-blue-500 text-white'
                    : `${colors.bg} ${colors.text} hover:opacity-80`
                  }`}
              >
                {type} ({count})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const panelBody = (
    <div className={`${isDesktop ? 'max-h-96' : 'flex-1'} overflow-y-auto px-2 py-3`}>
      {filteredNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 rounded-full bg-slate-800/50 p-4">
            <Bell className="h-8 w-8 text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-300">
            {filter === 'all' ? 'Aucune notification' : `Aucune notification ${filter === 'unread' ? 'non lue' : filter}`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {filter === 'all'
              ? 'Vous êtes à jour !'
              : 'Essayez un autre filtre'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredNotifications.map((notification) => {
            const IconComponent = getNotificationIcon(notification.type);
            const colors = getNotificationColors(notification.type);
            const relativeTime = getRelativeTimeFromNow(notification.createdAt);
            const hasRelatedResource = notification.relatedResource?.resourceId;

            return (
              <li key={notification.id} className="group">
                <div
                  className={`flex flex-col gap-2 rounded-lg border ${colors.border} ${colors.bg} p-3 transition-all ${notification.read
                      ? 'opacity-70 hover:opacity-90'
                      : 'shadow-sm hover:shadow-md'
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-lg ${colors.bg} p-2 ${colors.text}`}>
                      <IconComponent className="h-4 w-4" strokeWidth={2} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className="flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-100">
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="h-2 w-2 rounded-full bg-blue-400" aria-label="Non lu" />
                            )}
                          </div>
                          {notification.message && (
                            <p className="mt-1 text-sm text-slate-300 line-clamp-2">
                              {notification.message}
                            </p>
                          )}
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400">{relativeTime}</span>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!notification.read && (
                            <button
                              type="button"
                              onClick={(e) => handleMarkAsRead(e, notification.id)}
                              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              title="Marquer comme lu"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {hasRelatedResource && (
                            <button
                              type="button"
                              onClick={() => handleNotificationClick(notification)}
                              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              title="Voir détails"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, notification.id)}
                            className="rounded p-1.5 text-slate-400 transition hover:bg-red-500/20 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const panelFooter = notifications.length > 0 && (
    <div className="border-t border-slate-700/70 px-5 py-4">
      <button
        type="button"
        onClick={markAll}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
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
      className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
