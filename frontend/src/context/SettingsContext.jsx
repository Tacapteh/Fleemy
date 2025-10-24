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

    return Object.keys(DEFAULT_PREFS).reduce((acc, key) => {
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
          await setDoc(prefsRef, DEFAULT_PREFS);
        }
      } catch (error) {
        console.error("SettingsProvider: unable to initialize preferences", error);
      }

      if (cancelled) {
        setLoading(false);
        return;
      }

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
          console.error("SettingsProvider: unable to load preferences", error);
          setSettings({ ...DEFAULT_PREFS });
          setLoading(false);
        }
      );
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
      const uid = currentUser?.uid;
      if (!uid) {
        setSettings((prev) => ({
          ...(prev || DEFAULT_PREFS),
          [key]: value,
        }));
        return;
      }

      const prefsRef = doc(db, "users", uid, "settings", "preferences");

      try {
        await updateDoc(prefsRef, { [key]: value });
        setSettings((prev) => {
          if (!prev) {
            return {
              ...DEFAULT_PREFS,
              [key]: value,
            };
          }
          return {
            ...prev,
            [key]: value,
          };
        });
      } catch (error) {
        console.error("SettingsProvider: unable to update preference", error);
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
