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

function normalizeNotifications(rawNotifications) {
  if (!Array.isArray(rawNotifications)) {
    return [];
  }

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

  return rawNotifications
    .map((notification) => {
      const createdAt = notification?.createdAt || notification?.created_at || null;

      return {
        ...notification,
        createdAt,
      };
    })
    .sort((left, right) => getComparableTimestamp(right.createdAt) - getComparableTimestamp(left.createdAt));
}

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

      if (Array.isArray(data)) {
        setNotifications(normalizeNotifications(data));
      } else if (data?.notifications && Array.isArray(data.notifications)) {
        setNotifications(normalizeNotifications(data.notifications));
      } else {
        setNotifications([]);
      }

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
