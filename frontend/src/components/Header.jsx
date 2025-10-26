import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import NotificationsPanel from './NotificationsPanel';
import useNotifications from '../hooks/useNotifications';

export default function Header({ user }) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasFetchedNotifications, setHasFetchedNotifications] = useState(false);
  const anchorRef = useRef(null);
  const bellButtonRef = useRef(null);
  const wasOpenRef = useRef(false);

  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAllAsRead,
  } = useNotifications(user?.uid);

  useEffect(() => {
    if (wasOpenRef.current && !isNotificationsOpen) {
      bellButtonRef.current?.focus();
    }
    wasOpenRef.current = isNotificationsOpen;
  }, [isNotificationsOpen]);

  useEffect(() => {
    setIsNotificationsOpen(false);
    setHasFetchedNotifications(false);
  }, [user?.uid]);

  const handleToggleNotifications = () => {
    if (!isNotificationsOpen) {
      if (!hasFetchedNotifications) {
        fetchNotifications()
          .then(() => {
            setHasFetchedNotifications(true);
          })
          .catch(() => {
            setHasFetchedNotifications(false);
          });
      }
      setIsNotificationsOpen(true);
      return;
    }
    setIsNotificationsOpen(false);
  };

  const handleCloseNotifications = () => {
    setIsNotificationsOpen(false);
  };

  const handleMarkAllAsRead = async (ids) => {
    await markAllAsRead(ids);
  };

  const ariaLabel = unreadCount > 0
    ? `Notifications, ${unreadCount} non lues`
    : 'Notifications';

  return (
    <header className="relative">
      <div className="absolute top-4 right-4 z-40 md:right-6">
        <div ref={anchorRef} className="relative">
          <button
            ref={bellButtonRef}
            type="button"
            onClick={handleToggleNotifications}
            aria-label={ariaLabel}
            aria-expanded={isNotificationsOpen}
            className="relative flex h-12 w-12 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/90 text-xl text-slate-100 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 md:h-10 md:w-10 md:text-lg"
          >
            <Bell className="h-6 w-6 md:h-5 md:w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-0 right-0 inline-flex h-3.5 w-3.5 translate-x-1/3 -translate-y-1/3 rounded-full bg-red-500"
              />
            )}
          </button>

          <NotificationsPanel
            isOpen={isNotificationsOpen}
            onClose={handleCloseNotifications}
            notifications={notifications}
            onMarkAllAsRead={handleMarkAllAsRead}
            anchorRef={anchorRef}
          />
        </div>
      </div>
    </header>
  );
}
