/*
User preferences are stored in Firestore in a single document per user:
  Document path: users/{uid}/settings/preferences

Expected fields inside that document:
  - showWeekends (bool)
  - showFullDay (bool)
  - enableMinutes (bool)
  - darkMode (bool)
  - requireClientName (bool)
  - defaultSlotDurationMinutes (number)

Publish the following security rules in the Firebase console (Firestore Database -> Rules -> Publish)
to allow the authenticated user to read/write their own preferences without permission errors:

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // allow the signed-in user to read/write their own documents
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // allow read/write access to all subcollections owned by the same user
      match /{subcollection=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}

Without these rules published, Firestore will respond with "Missing or insufficient permissions"
and the dark mode preference cannot be saved remotely.
*/

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const DEFAULT_PREFS = {
  showWeekends: true,
  showFullDay: false,
  enableMinutes: false,
  darkMode: false,
  requireClientName: true,
  defaultSlotDurationMinutes: 60,
  dayStartHour: 7,
  dayEndHour: 20,
  hourlyRateGlobal: 0,
  showTaskPriorityBadges: true,
};

const SettingsContext = createContext({
  settings: DEFAULT_PREFS,
  loading: true,
  updateSetting: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(() => auth.currentUser || null);

  const sanitizePreferences = useCallback((data) => {
    if (!data || typeof data !== "object") {
      return { ...DEFAULT_PREFS };
    }

    const sanitized = Object.keys(DEFAULT_PREFS).reduce((acc, key) => {
      const incomingValue = Object.prototype.hasOwnProperty.call(data, key)
        ? data[key]
        : undefined;

      if (incomingValue === undefined) {
        acc[key] = DEFAULT_PREFS[key];
        return acc;
      }

      if (key === "defaultSlotDurationMinutes") {
        const numericValue = Number(incomingValue);
        acc[key] = Number.isFinite(numericValue)
          ? numericValue
          : DEFAULT_PREFS.defaultSlotDurationMinutes;
        return acc;
      }

      if (key === "hourlyRateGlobal") {
        const numericValue = Number(incomingValue);
        if (!Number.isFinite(numericValue) || numericValue < 0) {
          acc[key] = 0;
          return acc;
        }

        const rounded = Math.round(numericValue * 100) / 100;
        acc[key] = rounded;
        return acc;
      }

      if (key === "dayStartHour" || key === "dayEndHour") {
        const numericValue = Number(incomingValue);
        if (!Number.isFinite(numericValue)) {
          acc[key] = DEFAULT_PREFS[key];
          return acc;
        }

        const truncated = Math.trunc(numericValue);
        const clamped = Math.max(0, Math.min(23, truncated));
        acc[key] = clamped;
        return acc;
      }

      if (typeof DEFAULT_PREFS[key] === "boolean") {
        if (typeof incomingValue === "string") {
          const normalized = incomingValue.trim().toLowerCase();
          acc[key] = normalized === "true" || normalized === "1";
        } else {
          acc[key] = Boolean(incomingValue);
        }
        return acc;
      }

      acc[key] = incomingValue;
      return acc;
    }, {});

    const resolvedStart = Number.isFinite(sanitized.dayStartHour)
      ? sanitized.dayStartHour
      : DEFAULT_PREFS.dayStartHour;
    const resolvedEnd = Number.isFinite(sanitized.dayEndHour)
      ? sanitized.dayEndHour
      : DEFAULT_PREFS.dayEndHour;

    let normalizedStart = Math.max(0, Math.min(22, Math.trunc(resolvedStart)));
    let normalizedEnd = Math.max(1, Math.min(23, Math.trunc(resolvedEnd)));

    if (normalizedEnd <= normalizedStart) {
      normalizedEnd = Math.min(23, normalizedStart + 1);
    }

    sanitized.dayStartHour = normalizedStart;
    sanitized.dayEndHour = normalizedEnd;

    return sanitized;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setCurrentUser(nextUser || null);
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const uid = currentUser?.uid;

    if (!uid) {
      setSettings({ ...DEFAULT_PREFS });
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const prefsRef = doc(db, "users", uid, "settings", "preferences");
    let unsubscribeSnapshot;
    let cancelled = false;

    const setupPreferencesListener = async () => {
      try {
        const existingPrefs = await getDoc(prefsRef);
        if (!existingPrefs.exists()) {
          try {
            await setDoc(prefsRef, DEFAULT_PREFS);
          } catch (error) {
            if (!cancelled) {
              console.warn("SettingsProvider: unable to initialize preferences", error);
              setSettings({ ...DEFAULT_PREFS });
              setLoading(false);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("SettingsProvider: unable to initialize preferences", error);
          setSettings({ ...DEFAULT_PREFS });
          setLoading(false);
        }
      }

      if (cancelled) {
        setLoading(false);
        return;
      }

      try {
        unsubscribeSnapshot = onSnapshot(
          prefsRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setSettings({ ...DEFAULT_PREFS });
              setLoading(false);
              return;
            }

            const sanitized = sanitizePreferences(snapshot.data());
            setSettings(sanitized);
            setLoading(false);
          },
          (error) => {
            console.warn("SettingsProvider: unable to load preferences", error);
            setSettings({ ...DEFAULT_PREFS });
            setLoading(false);
          }
        );
      } catch (error) {
        if (!cancelled) {
          console.warn("SettingsProvider: unable to load preferences", error);
          setSettings({ ...DEFAULT_PREFS });
          setLoading(false);
        }
      }
    };

    setupPreferencesListener();

    return () => {
      cancelled = true;
      if (typeof unsubscribeSnapshot === "function") {
        unsubscribeSnapshot();
      }
    };
  }, [currentUser, sanitizePreferences]);

  const updateSetting = useCallback(
    async (key, value) => {
      setSettings((prev) => ({ ...(prev || DEFAULT_PREFS), [key]: value }));

      const uid = currentUser?.uid;
      if (!uid) {
        return;
      }

      const prefsRef = doc(db, "users", uid, "settings", "preferences");

      try {
        await updateDoc(prefsRef, { [key]: value });
      } catch (err) {
        console.warn("SettingsProvider: unable to update preference", err);
      }
    },
    [currentUser]
  );

  const value = useMemo(
    () => ({
      settings,
      loading,
      updateSetting,
    }),
    [settings, loading, updateSetting]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
