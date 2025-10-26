import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'notificationsEnabled';

function readInitialValue() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue === null) {
      return true;
    }
    return storedValue === 'true';
  } catch (error) {
    console.warn('Unable to read notifications preference from localStorage', error);
    return true;
  }
}

export default function useNotificationPreferences() {
  const [notificationsEnabled, setNotificationsEnabledState] = useState(readInitialValue);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY) {
        setNotificationsEnabledState(event.newValue !== 'false');
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const persistValue = useCallback((value) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    } catch (error) {
      console.warn('Unable to persist notifications preference to localStorage', error);
    }
  }, []);

  const setNotificationsEnabled = useCallback(
    (value) => {
      const normalizedValue = value === true;
      setNotificationsEnabledState(normalizedValue);
      persistValue(normalizedValue);
    },
    [persistValue],
  );

  const toggleNotifications = useCallback(() => {
    setNotificationsEnabledState((previous) => {
      const nextValue = !previous;
      persistValue(nextValue);
      return nextValue;
    });
  }, [persistValue]);

  return {
    notificationsEnabled,
    toggleNotifications,
    setNotificationsEnabled,
  };
}
