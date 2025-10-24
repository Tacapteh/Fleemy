import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const DEFAULT_SETTINGS = {
  showWeekends: true,
  showFullDay: false,
  enableMinutes: false,
  darkMode: false,
  requireClientName: true,
  defaultSlotDurationMinutes: 60,
};

const SettingsContext = createContext({
  settings: null,
  updateSetting: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => auth.currentUser || null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setCurrentUser(nextUser || null);
      if (!nextUser) {
        setSettings({ ...DEFAULT_SETTINGS });
      } else {
        setSettings(null);
      }
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
      setSettings((prev) => (prev == null ? { ...DEFAULT_SETTINGS } : prev));
      return undefined;
    }

    setSettings(null);

    const settingsDocRef = doc(db, "users", uid, "settings", "preferences", "display");
    let initializingDefaults = false;

    const unsubscribe = onSnapshot(
      settingsDocRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          if (!initializingDefaults) {
            initializingDefaults = true;
            try {
              await setDoc(settingsDocRef, DEFAULT_SETTINGS, { merge: false });
            } catch (error) {
              console.error("SettingsProvider: unable to initialize preferences", error);
            }
          }
          setSettings({ ...DEFAULT_SETTINGS });
          return;
        }

        const data = snapshot.data();
        if (!data || typeof data !== "object") {
          setSettings({ ...DEFAULT_SETTINGS });
          return;
        }

        const sanitized = Object.keys(DEFAULT_SETTINGS).reduce((acc, key) => {
          const incomingValue = Object.prototype.hasOwnProperty.call(data, key)
            ? data[key]
            : undefined;

          if (incomingValue === undefined) {
            acc[key] = DEFAULT_SETTINGS[key];
            return acc;
          }

          if (key === "defaultSlotDurationMinutes") {
            const numericValue = Number(incomingValue);
            acc[key] = Number.isFinite(numericValue)
              ? numericValue
              : DEFAULT_SETTINGS.defaultSlotDurationMinutes;
            return acc;
          }

          if (typeof DEFAULT_SETTINGS[key] === "boolean") {
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

        setSettings(sanitized);
      },
      (error) => {
        console.error("SettingsProvider: unable to load preferences", error);
        setSettings({ ...DEFAULT_SETTINGS });
      }
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [currentUser?.uid]);

  const updateSetting = useCallback(
    async (key, value) => {
      const uid = currentUser?.uid;
      if (!uid) {
        return;
      }

      const settingsDocRef = doc(db, "users", uid, "settings", "preferences", "display");

      try {
        await setDoc(settingsDocRef, { [key]: value }, { merge: true });
        setSettings((prev) => {
          if (!prev) {
            return prev;
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
    [currentUser?.uid]
  );

  const value = useMemo(
    () => ({
      settings,
      updateSetting,
    }),
    [settings, updateSetting]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
