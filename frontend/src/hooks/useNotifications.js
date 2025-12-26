import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { auth } from '../firebase';
import { getAuthHeaders } from '../utils/authHeaders';
import useNotificationPreferences from './useNotificationPreferences';

const LIST_ENDPOINT = '/api/notifications/list';
const MARK_READ_ENDPOINT = '/api/notifications/mark-read';
const POLLING_INTERVAL_MS = 30_000;

const isFirestoreTimestamp = (value) =>
  value && typeof value === 'object' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number';

const toISOString = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed).toISOString();
  }

  if (isFirestoreTimestamp(value)) {
    try {
      const milliseconds = value.seconds * 1000 + Math.floor(value.nanoseconds / 1_000_000);
      return new Date(milliseconds).toISOString();
    } catch (error) {
      console.warn('Unable to convert Firestore timestamp to ISO string', error);
      return null;
    }
  }

  return null;
};

const getNotificationId = (notification) =>
  notification?.id
  || notification?.notificationId
  || notification?.docId
  || notification?.documentId
  || null;

const normalizeNotifications = (rawNotifications) => {
  if (!Array.isArray(rawNotifications)) {
    return [];
  }

  const dedupedMap = new Map();

  rawNotifications.forEach((notification) => {
    if (!notification || typeof notification !== 'object') {
      return;
    }

    const id = getNotificationId(notification);
    if (!id) {
      return;
    }

    const createdAt =
      notification.createdAt
      || notification.created_at
      || notification.created_at_ts
      || notification.created_at_iso
      || null;

    const normalizedNotification = {
      id,
      userId: notification.userId || notification.user_id || null,
      title: notification.title || '',
      message: notification.message || notification.body || '',
      type: notification.type || 'info',
      createdAt: toISOString(createdAt),
      read: Boolean(notification.read),
      relatedResource: notification.relatedResource || notification.related_resource || null,
    };

    dedupedMap.set(id, normalizedNotification);
  });

  const getComparableTimestamp = (value) => {
    if (!value) {
      return 0;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return 0;
    }

    return parsed;
  };

  return Array.from(dedupedMap.values()).sort(
    (left, right) => getComparableTimestamp(right.createdAt) - getComparableTimestamp(left.createdAt),
  );
};

export function useNotifications(userId) {
  const { notificationsEnabled } = useNotificationPreferences();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);
  const pollingTimerRef = useRef(null);
  const activeFetchControllerRef = useRef(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  useEffect(() => () => {
    isMountedRef.current = false;
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (activeFetchControllerRef.current) {
      activeFetchControllerRef.current.abort();
      activeFetchControllerRef.current = null;
    }
  }, []);

  const fetchNotifications = useCallback(async ({ silent = false, signal } = {}) => {
    if (!notificationsEnabled) {
      if (isMountedRef.current) {
        setNotifications([]);
        setLoading(false);
        setError(null);
      }
      return false;
    }

    const currentUserId = userId || auth.currentUser?.uid;
    if (!currentUserId) {
      if (isMountedRef.current) {
        setNotifications([]);
        setLoading(false);
      }
      return false;
    }

    if (!silent && isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    const controller = signal ? null : new AbortController();
    if (controller) {
      if (activeFetchControllerRef.current) {
        activeFetchControllerRef.current.abort();
      }
      activeFetchControllerRef.current = controller;
    }

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
        signal: signal ?? controller?.signal,
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}`);
      }

      const data = await response.json();
      if (!isMountedRef.current) {
        return false;
      }

      const normalizedNotifications = Array.isArray(data?.notifications)
        ? normalizeNotifications(data.notifications)
        : normalizeNotifications(data);

      setNotifications(normalizedNotifications);

      if (isMountedRef.current) {
        setError(null);
      }

      return true;
    } catch (fetchError) {
      if (fetchError?.name === 'AbortError') {
        return false;
      }
      console.error('Failed to fetch notifications', fetchError);
      if (isMountedRef.current) {
        setError(fetchError);
      }
      return false;
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false);
      }
      if (!signal && activeFetchControllerRef.current === controller) {
        activeFetchControllerRef.current = null;
      }
    }
  }, [notificationsEnabled, userId]);

  const markAsRead = useCallback(
    async (id) => {
      if (!notificationsEnabled) {
        return false;
      }

      const currentUserId = userId || auth.currentUser?.uid;
      if (!currentUserId || !id) {
        return false;
      }

      // Optimistic update
      setNotifications((prevNotifications) => {
        if (!Array.isArray(prevNotifications) || prevNotifications.length === 0) {
          return prevNotifications;
        }

        return prevNotifications.map((notification) =>
          notification.id === id
            ? { ...notification, read: true }
            : notification
        );
      });

      try {
        const headers = await getAuthHeaders();
        headers['Content-Type'] = 'application/json';

        const response = await fetch(MARK_READ_ENDPOINT, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            userId: currentUserId,
            notificationIds: [id],
          }),
        });

        if (!response.ok) {
          throw new Error(`Erreur ${response.status}`);
        }

        setError(null);
        return true;
      } catch (markError) {
        console.error('Failed to mark notification as read', markError);
        // Revert optimistic update on error
        setNotifications((prevNotifications) => {
          if (!Array.isArray(prevNotifications) || prevNotifications.length === 0) {
            return prevNotifications;
          }

          return prevNotifications.map((notification) =>
            notification.id === id
              ? { ...notification, read: false }
              : notification
          );
        });
        setError(markError);
        return false;
      }
    },
    [notificationsEnabled, userId],
  );

  const deleteNotification = useCallback(
    async (id) => {
      if (!notificationsEnabled) {
        return false;
      }

      const currentUserId = userId || auth.currentUser?.uid;
      if (!currentUserId || !id) {
        return false;
      }

      // Optimistic update
      const previousNotifications = notifications;
      setNotifications((prevNotifications) => {
        if (!Array.isArray(prevNotifications) || prevNotifications.length === 0) {
          return prevNotifications;
        }

        return prevNotifications.filter((notification) => notification.id !== id);
      });

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/notifications/${id}`, {
          method: 'DELETE',
          headers,
        });

        if (!response.ok) {
          throw new Error(`Erreur ${response.status}`);
        }

        setError(null);
        return true;
      } catch (deleteError) {
        console.error('Failed to delete notification', deleteError);
        // Revert optimistic update on error
        setNotifications(previousNotifications);
        setError(deleteError);
        return false;
      }
    },
    [notifications, notificationsEnabled, userId],
  );

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

        setNotifications((prevNotifications) => {
          if (!Array.isArray(prevNotifications) || prevNotifications.length === 0) {
            return prevNotifications;
          }

          const idsToUpdate = new Set(unreadIds);

          return prevNotifications.map((notification) => (
            idsToUpdate.has(notification.id)
              ? { ...notification, read: true }
              : notification
          ));
        });

        setError(null);

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

  useEffect(() => {
    if (!notificationsEnabled) {
      return undefined;
    }

    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchNotifications, notificationsEnabled]);

  useEffect(() => {
    if (!notificationsEnabled) {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return undefined;
    }

    const resolvedUserId = userId || auth.currentUser?.uid;
    if (!resolvedUserId) {
      return undefined;
    }

    fetchNotifications();

    if (typeof window === 'undefined') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchNotifications({ silent: true });
    }, POLLING_INTERVAL_MS);

    pollingTimerRef.current = intervalId;

    return () => {
      clearInterval(intervalId);
      if (pollingTimerRef.current === intervalId) {
        pollingTimerRef.current = null;
      }
    };
  }, [fetchNotifications, notificationsEnabled, userId]);

  if (!notificationsEnabled) {
    const noop = () => { };
    return {
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      fetchNotifications: noop,
      markAsRead: noop,
      markAllAsRead: noop,
      deleteNotification: noop,
      setNotifications: noop,
    };
  }

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    setNotifications,
  };
}

export default useNotifications;
