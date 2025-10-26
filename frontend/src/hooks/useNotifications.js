import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getAuthHeaders } from '../utils/authHeaders';
import useNotificationPreferences from './useNotificationPreferences';

const LIST_ENDPOINT = '/api/notifications/list';
const MARK_READ_ENDPOINT = '/api/notifications/mark-read';

export function useNotifications(userId) {
  const { notificationsEnabled } = useNotificationPreferences();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  const fetchNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      setNotifications([]);
      return;
    }

    const currentUserId = userId || auth.currentUser?.uid;
    if (!currentUserId) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        userId: currentUserId,
        onlyUnread: 'false',
        limit: '20',
      });

      const headers = await getAuthHeaders();
      const response = await fetch(`${LIST_ENDPOINT}?${params.toString()}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}`);
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setNotifications(data);
      } else if (data?.notifications && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      } else {
        setNotifications([]);
      }
    } catch (fetchError) {
      console.error('Failed to fetch notifications', fetchError);
      setError(fetchError);
    } finally {
      setLoading(false);
    }
  }, [notificationsEnabled, userId]);

  const markAllAsRead = useCallback(
    async (ids) => {
      if (!notificationsEnabled) {
        return false;
      }

      const currentUserId = userId || auth.currentUser?.uid;
      const unreadIds = Array.isArray(ids) && ids.length > 0
        ? ids
        : notifications.filter((notification) => !notification.read).map((notification) => notification.id);

      if (!currentUserId || unreadIds.length === 0) {
        return false;
      }

      try {
        const headers = await getAuthHeaders();
        headers['Content-Type'] = 'application/json';

        const response = await fetch(MARK_READ_ENDPOINT, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            userId: currentUserId,
            notificationIds: unreadIds,
          }),
        });

        if (!response.ok) {
          throw new Error(`Erreur ${response.status}`);
        }

        setNotifications((prevNotifications) =>
          prevNotifications.map((notification) =>
            unreadIds.includes(notification.id)
              ? { ...notification, read: true }
              : notification,
          ),
        );

        return true;
      } catch (markError) {
        console.error('Failed to mark notifications as read', markError);
        setError(markError);
        return false;
      }
    },
    [notifications, notificationsEnabled, userId],
  );

  useEffect(() => {
    if (!userId && !auth.currentUser) {
      setNotifications([]);
      setError(null);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!notificationsEnabled) {
      setNotifications([]);
      setError(null);
      setLoading(false);
    }
  }, [notificationsEnabled]);

  if (!notificationsEnabled) {
    const noop = () => {};
    return {
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      fetchNotifications: noop,
      markAllAsRead: noop,
      setNotifications: noop,
    };
  }

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markAllAsRead,
    setNotifications,
  };
}

export default useNotifications;
