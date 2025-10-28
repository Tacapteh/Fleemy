import { useEffect, useState } from "react";
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { showToast } from "./utils/toast";

const sanitizeConfigValue = (value) => {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "undefined" || lower === "null") {
    return null;
  }

  if (trimmed.startsWith("${") && trimmed.endsWith("}")) {
    return null;
  }

  return trimmed;
};

const firebaseConfig = {
  apiKey: sanitizeConfigValue(process.env.REACT_APP_FIREBASE_API_KEY),
  authDomain: sanitizeConfigValue(process.env.REACT_APP_FIREBASE_AUTH_DOMAIN),
  projectId: sanitizeConfigValue(process.env.REACT_APP_FIREBASE_PROJECT_ID),
  appId: sanitizeConfigValue(process.env.REACT_APP_FIREBASE_APP_ID),
  messagingSenderId: sanitizeConfigValue(process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID),
  storageBucket: sanitizeConfigValue(process.env.REACT_APP_FIREBASE_STORAGE_BUCKET),
  measurementId: sanitizeConfigValue(process.env.REACT_APP_FIREBASE_MEASUREMENT_ID),
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"];
const missingConfig = requiredKeys.filter((key) => !firebaseConfig[key]);

if (missingConfig.length) {
  throw new Error(
    `Missing Firebase configuration: ${missingConfig.join(", ")}. ` +
      "Set the corresponding REACT_APP_FIREBASE_* values in your .env file (see .env.example)."
  );
}

Object.keys(firebaseConfig).forEach((key) => {
  if (firebaseConfig[key] == null || firebaseConfig[key] === "") {
    delete firebaseConfig[key];
  }
});

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const projectId = app.options.projectId;
console.log("FB projectId", projectId);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const REDIRECT_IN_PROGRESS_ERROR_CODE = "auth/redirect-in-progress";

const POPUP_FALLBACK_ERROR_CODES = new Set([
  "auth/network-request-failed",
  "auth/internal-error",
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
  REDIRECT_IN_PROGRESS_ERROR_CODE,
]);

const REDIRECT_IGNORABLE_ERROR_CODES = new Set([
  "auth/no-auth-event",
  REDIRECT_IN_PROGRESS_ERROR_CODE,
]);

const isRecoverablePopupError = (error) => {
  if (!error || typeof error.code !== "string") {
    return false;
  }

  if (POPUP_FALLBACK_ERROR_CODES.has(error.code)) {
    return true;
  }

  if (
    error.code === "auth/internal-error" &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("third-party cookies")
  ) {
    return true;
  }

  return false;
};

let redirectResultPromise = null;

export const GOOGLE_SIGN_IN_STATUS = Object.freeze({
  SUCCESS: "success",
  REDIRECT_TRIGGERED: "redirect-triggered",
  RECOVERABLE_ERROR: "recoverable-error",
});

const buildSignInResult = ({ user = null, status, error = null }) => ({
  user: user || null,
  status,
  error,
});

export const signInWithGoogle = async () => {
  try {
    const popupResult = await signInWithPopup(auth, googleProvider);
    return buildSignInResult({
      user: popupResult?.user || null,
      status: GOOGLE_SIGN_IN_STATUS.SUCCESS,
    });
  } catch (error) {
    if (error?.code === REDIRECT_IN_PROGRESS_ERROR_CODE) {
      console.info("Google redirect already in progress, reusing existing flow");
      return buildSignInResult({
        status: GOOGLE_SIGN_IN_STATUS.REDIRECT_TRIGGERED,
      });
    }

    if (isRecoverablePopupError(error)) {
      console.warn("Popup sign-in failed, falling back to redirect flow", error);
      redirectResultPromise = null;
      try {
        await signInWithRedirect(auth, googleProvider);
        return buildSignInResult({
          status: GOOGLE_SIGN_IN_STATUS.REDIRECT_TRIGGERED,
        });
      } catch (redirectError) {
        if (redirectError?.code === REDIRECT_IN_PROGRESS_ERROR_CODE) {
          console.info(
            "Google redirect was already pending when attempting fallback",
            redirectError
          );
          return buildSignInResult({
            status: GOOGLE_SIGN_IN_STATUS.REDIRECT_TRIGGERED,
          });
        }

        if (isRecoverablePopupError(redirectError)) {
          console.warn(
            "Redirect sign-in encountered a recoverable issue",
            redirectError
          );
          return buildSignInResult({
            status: GOOGLE_SIGN_IN_STATUS.RECOVERABLE_ERROR,
            error: redirectError,
          });
        }

        throw redirectError;
      }
    }

    throw error;
  }
};

export const getGoogleRedirectResult = () => {
  if (!redirectResultPromise) {
    redirectResultPromise = getRedirectResult(auth)
      .then((result) => result)
      .catch((error) => {
        if (!error || typeof error.code !== "string") {
          console.error("Failed to resolve Google redirect result", error);
          return null;
        }

        if (REDIRECT_IGNORABLE_ERROR_CODES.has(error.code)) {
          return null;
        }

        if (isRecoverablePopupError(error)) {
          console.warn("Recoverable redirect error encountered", error);
          return null;
        }

        console.error("Unhandled Google redirect error", error);
        return null;
      })
      .finally(() => {
        redirectResultPromise = null;
      });
  }

  return redirectResultPromise;
};

let cachedAuthPromise = null;
let authReady = false;
let lastResolvedUser = null;

export const waitForAuth = () => {
  const currentUser = auth.currentUser;
  if (currentUser) {
    authReady = true;
    lastResolvedUser = currentUser;
    return Promise.resolve(currentUser);
  }
  if (authReady) {
    return Promise.resolve(lastResolvedUser);
  }
  if (cachedAuthPromise) {
    return cachedAuthPromise;
  }
  cachedAuthPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        lastResolvedUser = user || null;
        authReady = true;
        cachedAuthPromise = null;
        unsubscribe();
        resolve(lastResolvedUser);
      },
      (error) => {
        console.error('waitForAuth error', error);
        lastResolvedUser = null;
        authReady = true;
        cachedAuthPromise = null;
        unsubscribe();
        resolve(null);
      }
    );
  });
  return cachedAuthPromise;
};

export const getUid = () => auth.currentUser?.uid || null;

export const waitForAuthenticatedUid = async ({ requireUser = true, warnOnPending = false, onCancel } = {}) => {
  const immediateUid = getUid();
  if (immediateUid) {
    return immediateUid;
  }
  if (warnOnPending && !authReady) {
    console.warn('Auth non encore initialisée');
  }

  const firstResolution = await waitForAuth();
  if (firstResolution?.uid) {
    return firstResolution.uid;
  }
  if (!requireUser) {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user?.uid) {
          unsubscribe();
          settle(user.uid);
        }
      },
      (error) => {
        console.error('waitForAuthenticatedUid error', error);
        unsubscribe();
        settle(null);
      }
    );

    const cancel = () => {
      unsubscribe();
      settle(null);
    };

    if (typeof onCancel === 'function') {
      onCancel(cancel);
    }
  });
};

const planningRealtimeRegistry = new Set();
const planningAuthSubscribers = new Set();

const registerPlanningListener = (unsubscribe) => {
  if (typeof unsubscribe !== 'function') {
    return () => {};
  }
  let active = true;
  const wrapped = () => {
    if (!active) {
      return;
    }
    active = false;
    planningRealtimeRegistry.delete(wrapped);
    try {
      unsubscribe();
    } catch (error) {
      console.error('Error while unsubscribing planning listener', error);
    }
  };
  planningRealtimeRegistry.add(wrapped);
  return wrapped;
};

const clearPlanningListeners = () => {
  if (!planningRealtimeRegistry.size) {
    return;
  }
  Array.from(planningRealtimeRegistry).forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch (error) {
      console.error('Error while clearing planning listener', error);
    }
  });
  planningRealtimeRegistry.clear();
};

const registerPlanningAuthRestart = (callback) => {
  if (typeof callback !== 'function') {
    return () => {};
  }
  planningAuthSubscribers.add(callback);
  return () => {
    planningAuthSubscribers.delete(callback);
  };
};

const notifyPlanningAuthSubscribers = () => {
  if (!planningAuthSubscribers.size) {
    return;
  }
  const pending = Array.from(planningAuthSubscribers);
  planningAuthSubscribers.clear();
  pending.forEach((callback) => {
    try {
      callback();
    } catch (error) {
      console.error('Planning auth restart callback error', error);
    }
  });
};

let planningAuthTrackerInitialized = false;

const ensurePlanningAuthTracker = () => {
  if (planningAuthTrackerInitialized) {
    return;
  }
  planningAuthTrackerInitialized = true;
  onAuthStateChanged(auth, (user) => {
    if (user) {
      notifyPlanningAuthSubscribers();
      return;
    }
    clearPlanningListeners();
  });
};

ensurePlanningAuthTracker();

const recentErrors = new Map();

const logPermissionError = (path, uid, err, options = {}) => {
  if (err?.code !== "permission-denied") return;
  const { toast = true, level = "error" } = options;
  const key = `${path}|${err.message}`;
  const now = Date.now();
  if (!recentErrors.has(key) || now - recentErrors.get(key) > 3000) {
    const message = `Permission error path=${path} uid=${uid}: ${err.message}`;
    if (level === "warn") {
      console.warn(message);
    } else {
      console.error(message);
    }
    if (toast) {
      showToast("Accès refusé : vérifiez vos règles ou l'UID du document", true);
    }
    recentErrors.set(key, now);
  }
};

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT_EVENT_START = "09:00";
const DEFAULT_EVENT_END = "10:00";

const isPermissionDeniedError = (error) => {
  if (!error) return false;
  const code = error.code || error.status;
  if (code === "permission-denied" || code === "unauthenticated") {
    return true;
  }
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("missing or insufficient permissions") ||
    message.includes("permission_denied")
  );
};

const toPermissionDeniedError = (error) => {
  if (!error) {
    return null;
  }
  if (isPermissionDeniedError(error)) {
    return error;
  }
  const status = error?.response?.status ?? error?.status ?? null;
  const message = String(error?.message || "");
  if (status === 403 || message.toLowerCase().includes("forbidden")) {
    const normalized = new Error(
      message || "Missing or insufficient permissions",
    );
    normalized.code = "permission-denied";
    normalized.status = status ?? 403;
    normalized.originalError = error;
    return normalized;
  }
  if (message.toLowerCase().includes("not authorized")) {
    const normalized = new Error(message);
    normalized.code = "permission-denied";
    normalized.status = status ?? 403;
    normalized.originalError = error;
    return normalized;
  }
  return null;
};

const formatHourMinute = (hours, minutes) =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

const toHourMinuteString = (value, fallback = DEFAULT_EVENT_START) => {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    if (value.includes("T")) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return formatHourMinute(parsed.getUTCHours(), parsed.getUTCMinutes());
      }
    }
    const parts = value.split(":");
    if (parts.length > 0) {
      const rawHour = Number.parseInt(parts[0], 10);
      const rawMinute = Number.parseInt(parts[1] ?? "0", 10);
      if (!Number.isNaN(rawHour)) {
        const hour = Math.max(0, Math.min(rawHour, 23));
        const minute = Math.max(0, Math.min(Number.isNaN(rawMinute) ? 0 : rawMinute, 59));
        return formatHourMinute(hour, minute);
      }
    }
  }

  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      return formatHourMinute(value.getUTCHours(), value.getUTCMinutes());
    }
  }

  const date = toDateSafe(value);
  if (date) {
    return formatHourMinute(date.getUTCHours(), date.getUTCMinutes());
  }

  return fallback;
};

const getIsoWeekInfo = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { week: null, year: null };
  }
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return { week, year: utcDate.getUTCFullYear() };
};

const ensureDayKey = (day, fallbackDate) => {
  if (typeof day === "string" && day) {
    const normalized = day.toLowerCase();
    if (DAY_KEYS.includes(normalized)) {
      return normalized;
    }
  }
  if (typeof day === "number" && day >= 0 && day < DAY_KEYS.length) {
    return DAY_KEYS[day];
  }
  if (fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())) {
    const index = (fallbackDate.getDay() + 6) % 7;
    return DAY_KEYS[index];
  }
  return DAY_KEYS[0];
};

async function saveEventViaApiFallback(resolved, eventData, startTs, endTs) {
  const { ownerUid, teamId } = resolved;
  const apiFetch = await getApiFetch();

  const startDate =
    (typeof startTs?.toDate === "function" && startTs.toDate()) ||
    toDateSafe(eventData.start) ||
    new Date();
  const tentativeEnd =
    (typeof endTs?.toDate === "function" && endTs.toDate()) ||
    toDateSafe(eventData.end) ||
    new Date(startDate.getTime() + 60 * 60 * 1000);
  const endDate =
    tentativeEnd && tentativeEnd > startDate
      ? tentativeEnd
      : new Date(startDate.getTime() + 60 * 60 * 1000);

  const { week, year } = getIsoWeekInfo(startDate);
  const parsedRate = Number(
    typeof eventData.hourly_rate === "number"
      ? eventData.hourly_rate
      : eventData.hourly_rate ?? 0,
  );
  const hourlyRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 50;

  const body = {
    description: eventData.description || "",
    client_id: eventData.client_id || "",
    client_name: eventData.client_name || "",
    day: ensureDayKey(eventData.day, startDate),
    start_time: toHourMinuteString(eventData.start, DEFAULT_EVENT_START),
    end_time: toHourMinuteString(eventData.end, DEFAULT_EVENT_END),
    status: eventData.payment_status || eventData.status || eventData.type || "pending",
    type: eventData.type === 'absence' ? 'absence' : 'normal',
    hourly_rate: hourlyRate,
  };

  if (typeof year === "number" && !Number.isNaN(year)) {
    body.year = year;
  }
  if (typeof week === "number" && !Number.isNaN(week)) {
    body.week = week;
  }
  if (teamId) {
    body.team_id = teamId;
  }

  const method = eventData.id ? "PUT" : "POST";
  const path = eventData.id ? `/planning/events/${eventData.id}` : "/planning/events";

  const response = await apiFetch(path, {
    method,
    body: JSON.stringify(body),
  });

  if (!response || response.success === false) {
    const errorMessage = response?.error || "Impossible de sauvegarder l'événement";
    throw new Error(errorMessage);
  }

  const rawEvent = response.event || response;
  const owner = ownerUid;
  const team = teamId ?? null;
  const viewerUid = getUid();

  const durationMinutes = Math.max(
    Number.parseInt(rawEvent?.duration, 10) || Math.round((endDate - startDate) / 60000),
    0,
  );

  const normalizedDay = ensureDayKey(rawEvent?.day ?? eventData.day, startDate);
  const normalizedRate = Number.isFinite(Number(rawEvent?.hourly_rate))
    ? Number(rawEvent.hourly_rate)
    : hourlyRate;

  const enriched = {
    ...rawEvent,
    id:
      rawEvent?.id ||
      eventData.id ||
      rawEvent?.uid ||
      `${owner}-${Math.abs(startDate.getTime())}`,
    description: rawEvent?.description ?? eventData.description ?? "",
    client_name: rawEvent?.client_name ?? eventData.client_name ?? "",
    client_id: rawEvent?.client_id ?? eventData.client_id ?? "",
    status:
      rawEvent?.status ??
      rawEvent?.payment_status ??
      eventData.payment_status ??
      eventData.status ??
      eventData.type ??
      "pending",
    payment_status:
      rawEvent?.payment_status ??
      rawEvent?.status ??
      eventData.payment_status ??
      eventData.status ??
      eventData.type ??
      "pending",
    type: rawEvent?.type ?? (eventData.type === 'absence' ? 'absence' : 'normal'),
    hourly_rate: normalizedRate,
    day: normalizedDay,
    start: startDate,
    end: endDate,
    duration: durationMinutes,
    team_id: team,
    user_id: owner,
    owner_uid: owner,
  };

  const normalized = normalizeEventData(
    enriched.id,
    enriched,
    owner,
    team,
    viewerUid,
  );

  if (normalized) {
    return { ...normalized, source: "api-fallback" };
  }

  return {
    ...enriched,
    readOnly: viewerUid ? owner !== viewerUid : true,
    source: "api-fallback",
  };
}

async function deleteEventViaApiFallback(resolved, eventId) {
  const { teamId, ownerUid, sessionUid } = resolved || {};
  const apiFetch = await getApiFetch();

  const params = new URLSearchParams();
  if (teamId) {
    params.set("team_id", teamId);
  }

  const query = params.toString();
  const response = await apiFetch(
    `/planning/events/${eventId}${query ? `?${query}` : ""}`,
    {
      method: "DELETE",
    },
  );

  if (!response || response.success === false) {
    const errorMessage = response?.error || "Impossible de supprimer l'événement";
    throw new Error(errorMessage);
  }

  return {
    success: true,
    source: "api-fallback",
    id: eventId,
    owner_uid: ownerUid || sessionUid || getUid(),
    team_id: teamId ?? null,
  };
}

let apiFetchModulePromise = null;
const getApiFetch = async () => {
  if (!apiFetchModulePromise) {
    apiFetchModulePromise = import("./lib/api")
      .then((mod) => mod.apiFetch)
      .catch((error) => {
        apiFetchModulePromise = null;
        throw error;
      });
  }
  return apiFetchModulePromise;
};

export function useFirebaseUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const userRef = doc(db, "users", u.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              user_id: u.uid,
              email: u.email,
              name: u.displayName || null,
              team_id: null,
              created_at: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error("ensure user doc", err);
        }
      }
      setUser(u);
    });
    return () => unsub();
  }, []);
  return user;
}

export const logout = async () => {
  await signOut(auth);
  localStorage.removeItem("authToken");
};

// Context utilisateur/équipe
let currentTeamId = null;

// Garder les désabonnements pour éviter les doublons
let unsubEvents = null;
let unsubTasks = null;

export const setTeamContext = (teamId) => {
  currentTeamId = teamId;
};

export const listenTeamMemberships = (teamId, onData, onError) => {
  if (!teamId) {
    onData?.([]);
    return () => {};
  }

  let unsubscribe = null;
  let active = true;
  let fallbackAttempted = false;

  const cleanup = () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const fetchFallbackMembers = async () => {
    try {
      const apiFetch = await getApiFetch();
      const response = await apiFetch(`/teams/${teamId}/memberships`);
      if (!active) {
        return null;
      }
      const members = Array.isArray(response?.members) ? response.members : [];
      onData?.(members);
      return members;
    } catch (error) {
      console.error('listenTeamMemberships fallback error', error);
      return null;
    }
  };

  const handleError = async (error) => {
    if (!active) {
      return;
    }

    if (isPermissionDeniedError(error) && !fallbackAttempted) {
      fallbackAttempted = true;
      const fallbackMembers = await fetchFallbackMembers();
      if (fallbackMembers) {
        return;
      }
    }

    logPermissionError(`teams/${teamId}/memberships`, getUid(), error, { level: 'warn', toast: false });
    onError?.(error);
  };

  const handleSnapshot = (snapshot) => {
    if (!active) {
      return;
    }
    const members = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        uid: docSnap.id,
        displayName: data.displayName || data.name || null,
        email: data.email || null,
        ...data,
      };
    });
    onData?.(members);
  };

  const start = async () => {
    try {
      await waitForAuth();
      const currentUser = auth.currentUser;
      const currentUid = currentUser?.uid || null;
      if (currentUid) {
        await ensureTeamMemberContainer(teamId, currentUid, { suppressErrors: true });
      }
    } catch (error) {
      console.warn('listenTeamMemberships ensure container error', error);
    }

    try {
      const membersRef = collection(db, 'teams', teamId, 'memberships');
      unsubscribe = onSnapshot(membersRef, handleSnapshot, handleError);
    } catch (error) {
      await handleError(error);
    }
  };

  start();

  return () => {
    active = false;
    cleanup();
  };
};

// Utilitaire pour normaliser les dates
const normalizeDate = (date) => {
  if (!date) return null;
  if (date instanceof Timestamp) {
    return date.toDate();
  }
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === "string") {
    return new Date(date);
  }
  return date;
};

// Convert ISO week + day name to a Date object (Monday-based)
const DAY_NAME_INDEX = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const dateFromISOWeek = (year, week, dayName) => {
  const dayIndex = DAY_NAME_INDEX[dayName?.toLowerCase?.()];
  if (dayIndex === undefined) return null;
  const simple = new Date(year, 0, 4); // Jan 4th is always in week 1
  const dayOffset = (simple.getDay() + 6) % 7; // convert to Monday=0
  const monday = new Date(simple);
  monday.setDate(simple.getDate() - dayOffset + (week - 1) * 7);
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayIndex);
  return d;
};

// Helpers spécifiques planning -------------------------------------------------
const toFirestoreTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Timestamp) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return Timestamp.fromDate(date);
};

const ensurePlanningContext = async (context) => {
  await waitForAuth();
  const sessionUser = auth.currentUser;
  if (!sessionUser) {
    console.warn('Auth non initialisée : écoute différée');
    return { status: 'deferred' };
  }

  const sessionUid = sessionUser.uid;
  const normalizedContext = context && typeof context === 'object' ? context : {};
  const contextType = normalizedContext.type === 'team' ? 'team' : 'personal';

  let ownerUid = null;
  let teamId = null;
  let memberUid = null;

  if (contextType === 'team') {
    teamId = normalizedContext.teamId || null;
    memberUid =
      normalizedContext.memberUid ||
      normalizedContext.userId ||
      normalizedContext.ownerUid ||
      (typeof context === 'string' ? context : null);
    if (!teamId) {
      throw new Error('Team planning context requires teamId');
    }
    if (!memberUid) {
      throw new Error('Team planning context requires memberUid');
    }
    ownerUid = memberUid;
  } else {
    ownerUid =
      normalizedContext.userId ||
      normalizedContext.ownerUid ||
      normalizedContext.memberUid ||
      (typeof context === 'string' ? context : null);
    memberUid = ownerUid;
  }

  const targetUid = ownerUid || sessionUid;
  if (!targetUid) {
    console.warn('Auth non initialisée : écoute différée');
    return { status: 'deferred' };
  }

  if (contextType === 'team' && teamId && sessionUid) {
    try {
      await ensureTeamMemberContainer(teamId, sessionUid, { suppressErrors: true });
    } catch (membershipError) {
      console.warn('ensurePlanningContext membership ensure failed', membershipError);
    }
  }

  const viewingOwnData = targetUid === sessionUid;
  const readOnly = !viewingOwnData;
  let planningCollectionPath = null;
  let baseRef = null;
  let weeklyTasksRef = null;

  if (contextType === 'team' && teamId && targetUid) {
    planningCollectionPath = `teams/${teamId}/members/${targetUid}/planningEvents`;
    if (viewingOwnData) {
      baseRef = collection(db, 'teams', teamId, 'members', targetUid, 'planningEvents');
      weeklyTasksRef = collection(db, 'teams', teamId, 'members', targetUid, 'weeklyTasks');
    }
  } else if (viewingOwnData) {
    planningCollectionPath = `users/${sessionUid}/planningEvents`;
    baseRef = collection(db, 'users', sessionUid, 'planningEvents');
    weeklyTasksRef = collection(db, 'users', sessionUid, 'weeklyTasks');
  } else if (sessionUid) {
    planningCollectionPath = `users/${sessionUid}/planningEvents`;
  }

  return {
    status: 'ok',
    type: contextType,
    baseRef,
    eventsRef: baseRef,
    weeklyTasksRef,
    targetUid,
    ownerUid: targetUid,
    memberUid: memberUid || targetUid,
    teamId: teamId || null,
    sessionUid,
    readOnly,
    planningCollectionPath,
  };
};

const ensureTeamMemberContainer = async (teamId, memberUid, options = {}) => {
  const { suppressErrors = true } = options;
  if (!teamId || !memberUid) {
    return;
  }
  const currentUid = getUid();
  if (!currentUid || currentUid !== memberUid) {
    return;
  }
  try {
    const apiFetch = await getApiFetch();
    await apiFetch(`/teams/${teamId}/memberships/ensure`, {
      method: "POST",
      body: JSON.stringify({ include_joined_at: false }),
    });
  } catch (error) {
    const permissionError = toPermissionDeniedError(error);
    if (!suppressErrors) {
      throw permissionError || error;
    }
    if (permissionError) {
      console.warn("ensureTeamMemberContainer permission error", error);
      return;
    }
    console.warn("ensureTeamMemberContainer error", error);
  }
};

const normalizeTeamSnapshot = (docSnap) => {
  const data = docSnap?.data?.() || {};
  const members = Array.isArray(data.members) ? data.members : [];

  return {
    team_id: docSnap.id,
    name: data.name || 'Équipe sans nom',
    owner_uid: data.owner_uid || null,
    invite_code: data.invite_code || null,
    members_count: members.length,
    members,
  };
};

export async function fetchUserTeamsFromFirestore() {
  let uid = getUid();
  if (!uid) {
    uid = await waitForAuthenticatedUid({ warnOnPending: true });
  }
  if (!uid) {
    throw new Error("Impossible de récupérer les équipes sans utilisateur authentifié");
  }

  const uniqueTeams = new Map();

  const collect = (snapshot) => {
    snapshot.forEach((docSnap) => {
      const normalized = normalizeTeamSnapshot(docSnap);
      uniqueTeams.set(normalized.team_id, { ...normalized, source: 'firestore' });
    });
  };

  try {
    const teamsCollection = collection(db, 'teams');
    const memberQuery = query(teamsCollection, where('members', 'array-contains', uid));
    const ownerQuery = query(teamsCollection, where('owner_uid', '==', uid));

    const [memberSnapshot, ownerSnapshot] = await Promise.all([
      getDocs(memberQuery),
      getDocs(ownerQuery),
    ]);

    collect(memberSnapshot);
    collect(ownerSnapshot);

    return Array.from(uniqueTeams.values());
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return [];
    }

    logPermissionError('teams', uid, error, { level: 'warn', toast: false });
    throw error;
  }
}

const toDateSafe = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value);
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const parsed = value.toDate();
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }
  return null;
};

const EVENT_STATUS_VALUES = new Set(['paid', 'unpaid', 'pending', 'not_worked']);

const normalizeStringLower = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const deriveEventStatus = (data) => {
  const candidates = [
    data?.payment_status,
    data?.paymentStatus,
    data?.status,
    data?.state,
    data?.type,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const normalized = normalizeStringLower(candidate);
    if (normalized && EVENT_STATUS_VALUES.has(normalized)) {
      return normalized;
    }
  }

  if (typeof data?.status === 'string' && data.status.trim()) {
    return data.status.trim();
  }

  return 'pending';
};

const deriveEventType = (data) => {
  const candidates = [data?.type, data?.event_type, data?.eventType, data?.category];
  for (const candidate of candidates) {
    const normalized = normalizeStringLower(candidate);
    if (normalized === 'absence') {
      return 'absence';
    }
    if (normalized === 'normal' || normalized === 'work') {
      return 'normal';
    }
  }
  return 'normal';
};

const normalizeEventData = (id, data, ownerUid, teamId, viewerUid) => {
  if (!data) {
    return null;
  }

  const startValue = toDateSafe(data.start);
  const endValue = toDateSafe(data.end);

  if (!startValue || !endValue) {
    return null;
  }

  const resolvedOwner = data.owner_uid || data.user_id || ownerUid;

  const resolvedStatus = deriveEventStatus(data);
  const resolvedType = deriveEventType(data);
  const legacyTypeValue =
    typeof data.type === 'string' && !['absence', 'normal', 'work'].includes(normalizeStringLower(data.type))
      ? data.type
      : undefined;

  const normalized = {
    ...data,
    id,
    start: startValue,
    end: endValue,
    user_id: resolvedOwner,
    owner_uid: resolvedOwner,
    team_id: teamId ?? data.team_id ?? null,
    readOnly: viewerUid ? resolvedOwner !== viewerUid : true,
    status: resolvedStatus,
    payment_status: data.payment_status || resolvedStatus,
    type: resolvedType,
  };

  if (legacyTypeValue !== undefined) {
    normalized.legacy_type = legacyTypeValue;
  }

  return normalized;
};

const normalizeEventDocument = (docSnap, ownerUid, teamId, viewerUid) => {
  if (!docSnap || !docSnap.exists()) {
    return null;
  }
  return normalizeEventData(docSnap.id, docSnap.data(), ownerUid, teamId, viewerUid);
};

const normalizeTaskDateField = (value) => {
  if (!value) {
    return null;
  }

  let candidate = null;

  if (value instanceof Date) {
    candidate = new Date(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed;
    candidate = new Date(normalized);
  } else if (typeof value === 'number') {
    candidate = new Date(value);
  } else if (typeof value === 'object' && typeof value.toDate === 'function') {
    candidate = value.toDate();
  }

  if (!candidate || Number.isNaN(candidate.getTime())) {
    return null;
  }

  candidate.setHours(0, 0, 0, 0);
  const year = candidate.getFullYear();
  const month = String(candidate.getMonth() + 1).padStart(2, '0');
  const day = String(candidate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeTaskPriority = (value) => {
  if (typeof value !== 'string') {
    return 'medium';
  }

  const normalized = value.trim().toLowerCase();
  return ['high', 'medium', 'low'].includes(normalized) ? normalized : 'medium';
};

const normalizeTaskStatus = (value) => {
  if (typeof value !== 'string') {
    return 'todo';
  }

  const normalized = value.trim().toLowerCase();
  return ['todo', 'doing', 'done'].includes(normalized) ? normalized : 'todo';
};

const normalizeWeeklyTaskData = (id, data, ownerUid, teamId, viewerUid) => {
  if (!data) {
    return null;
  }

  const resolvedOwner = data.owner_uid || data.user_id || ownerUid;
  const rawRanges = Array.isArray(data.time_ranges)
    ? data.time_ranges
    : Array.isArray(data.time_slots)
    ? data.time_slots
    : [];

  const resolvedRanges = rawRanges.map((range) => {
    const rawDay = range?.day ?? range?.dayIndex ?? range?.weekday;
    const normalizedDay = normalizeWeekdayValue(rawDay);
    const normalizedWeekday = normalizeWeekdayValue(range?.weekday ?? normalizedDay);
    const normalizedDate = normalizeTaskDateField(
      range?.task_date ?? range?.taskDate ?? range?.task_day_iso ?? range?.taskDayIso ?? null,
    );

    return {
      ...range,
      day: normalizedDay ?? range?.day ?? null,
      weekday: normalizedWeekday ?? normalizedDay ?? null,
      task_date: normalizedDate ?? null,
      task_day_iso: normalizedDate ?? null,
      taskDate: normalizedDate ?? null,
    };
  });

  let resolvedWeekday = normalizeWeekdayValue(data.weekday);
  if (resolvedWeekday == null && resolvedRanges.length > 0) {
    resolvedWeekday = normalizeWeekdayValue(resolvedRanges[0]?.weekday ?? resolvedRanges[0]?.day ?? null);
  }

  const creationDateIso = normalizeTaskDateField(
    data.dateISO ?? data.dateIso ?? data.date_iso ?? null,
  );

  const rawStatus = typeof data.status === 'string' ? data.status : undefined;
  const normalizedStatus = rawStatus ? normalizeTaskStatus(rawStatus) : undefined;
  const isDone = data.done === true;

  return {
    id,
    label: data.label || data.title || data.name || 'Tâche sans titre',
    title: data.title || data.label || data.name || 'Tâche sans titre',
    price: data.price ?? null,
    color: data.color || data.colorCode || '#dbeafe',
    icon: data.icon || data.emoji || '📋',
    time_ranges: resolvedRanges,
    weekday: resolvedWeekday,
    startTime: data.startTime || data.start_time || (resolvedRanges[0]?.start ?? null),
    endTime: data.endTime || data.end_time || (resolvedRanges[0]?.end ?? null),
    weekly: true,
    user_id: resolvedOwner,
    owner_uid: resolvedOwner,
    team_id: teamId ?? data.team_id ?? null,
    readOnly: viewerUid ? resolvedOwner !== viewerUid : true,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
    dateISO: creationDateIso,
    priority: normalizeTaskPriority(data.priority),
    status: normalizedStatus || (isDone ? 'done' : 'todo'),
    done: isDone,
  };
};

const normalizeWeeklyTaskDocument = (docSnap, ownerUid, teamId, viewerUid) => {
  if (!docSnap || !docSnap.exists()) {
    return null;
  }
  return normalizeWeeklyTaskData(docSnap.id, docSnap.data(), ownerUid, teamId, viewerUid);
};

const normalizeWeeklyTaskTimeString = (
  value,
  { allowEndOfDay = false, enforceFullHour = false } = {}
) => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(":");
  if (parts.length < 1 || parts.length > 2) {
    return null;
  }

  const hours = Number.parseInt(parts[0], 10);
  const minutes = parts.length === 2 ? Number.parseInt(parts[1], 10) : 0;

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  if (allowEndOfDay && hours === 24) {
    if (minutes === 0) {
      return "24:00";
    }
    return null;
  }

  if (hours < 0 || hours > 23) {
    return null;
  }

  if (minutes < 0 || minutes > 59) {
    return null;
  }

  const normalizedMinutes = enforceFullHour ? 0 : minutes;

  return `${String(hours).padStart(2, "0")}:${String(normalizedMinutes).padStart(2, "0")}`;
};

const normalizeWeekdayValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    if (normalized >= 0 && normalized <= 6) {
      return normalized;
    }
    if (normalized >= 1 && normalized <= 7) {
      return (normalized + 6) % 7;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        return normalizeWeekdayValue(parsed);
      }

      const lower = trimmed.toLowerCase();
      const dayNameMap = {
        monday: 0,
        mon: 0,
        lundi: 0,
        tuesday: 1,
        tue: 1,
        mardi: 1,
        wednesday: 2,
        wed: 2,
        mercredi: 2,
        thursday: 3,
        thu: 3,
        jeudi: 3,
        friday: 4,
        fri: 4,
        vendredi: 4,
        saturday: 5,
        sat: 5,
        samedi: 5,
        sunday: 6,
        sun: 6,
        dimanche: 6,
      };
      if (Object.prototype.hasOwnProperty.call(dayNameMap, lower)) {
        return dayNameMap[lower];
      }
    }
  }

  return null;
};

const sanitizeWeeklyTaskTimeRanges = (ranges) => {
  if (!Array.isArray(ranges)) {
    return [];
  }

  return ranges
    .map((range) => {
      if (!range) {
        return null;
      }
      const rawDay = range.day ?? range.dayIndex ?? range.weekday;
      const day =
        typeof rawDay === "number"
          ? rawDay
          : Number.isFinite(Number.parseInt(rawDay, 10))
          ? Number.parseInt(rawDay, 10)
          : null;
      if (day == null || Number.isNaN(day) || day < 0 || day > 6) {
        return null;
      }

      const start = normalizeWeeklyTaskTimeString(range.start, {
        enforceFullHour: true,
      });
      const end = normalizeWeeklyTaskTimeString(range.end, {
        enforceFullHour: true,
        allowEndOfDay: true,
      });

      if (!start || !end) {
        return null;
      }

      const [startH, startM] = start.split(":").map((value) => Number.parseInt(value, 10));
      const [endH, endM] = end.split(":").map((value) => Number.parseInt(value, 10));
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (endMinutes <= startMinutes) {
        return null;
      }

      const taskDateIso = normalizeTaskDateField(
        range.task_date ?? range.taskDate ?? range.task_day_iso ?? range.taskDayIso ?? null,
      );

      const sanitized = { day, start, end, weekday: day };

      if (taskDateIso) {
        sanitized.task_date = taskDateIso;
        sanitized.task_day_iso = taskDateIso;
      }

      return sanitized;
    })
    .filter(Boolean);
};

const normalizeWeeklyTaskPrice = (value) => {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildWeeklyTaskPayload = (taskData, ownerUid, teamId, sanitizedRanges) => {
  const rawLabel = typeof taskData?.label === "string" ? taskData.label.trim() : "";
  const rawTitle = typeof taskData?.title === "string" ? taskData.title.trim() : "";

  const label = rawLabel || rawTitle || "Tâche sans titre";
  const title = rawTitle || rawLabel || "Tâche sans titre";

  let normalizedWeekday = normalizeWeekdayValue(taskData?.weekday);
  if (normalizedWeekday == null && Array.isArray(sanitizedRanges) && sanitizedRanges.length > 0) {
    normalizedWeekday = normalizeWeekdayValue(sanitizedRanges[0]?.day);
  }

  const payload = {
    label,
    title,
    price: normalizeWeeklyTaskPrice(taskData?.price),
    color: taskData?.color || null,
    icon: taskData?.icon || null,
    time_ranges: sanitizedRanges.map((range) => {
      const normalizedWeekday = normalizeWeekdayValue(range.weekday ?? range.day ?? null) ?? range.day;
      const payloadRange = {
        day: range.day,
        start: range.start,
        end: range.end,
        weekday: normalizedWeekday,
      };

      const normalizedDate = normalizeTaskDateField(range.task_date ?? range.task_day_iso ?? null);
      if (normalizedDate) {
        payloadRange.task_date = normalizedDate;
        payloadRange.task_day_iso = normalizedDate;
      }

      return payloadRange;
    }),
    weekly: true,
    owner_uid: ownerUid,
    user_id: ownerUid,
    team_id: teamId || null,
    updated_at: serverTimestamp(),
    priority: normalizeTaskPriority(taskData?.priority),
    status: normalizeTaskStatus(taskData?.status),
  };

  const normalizedCreationDate = normalizeTaskDateField(
    taskData?.dateISO ?? taskData?.dateIso ?? taskData?.date_iso ?? null,
  );

  if (normalizedCreationDate) {
    payload.dateISO = normalizedCreationDate;
  }

  const primaryRange = sanitizedRanges[0];
  if (primaryRange?.start) {
    payload.startTime = primaryRange.start;
    payload.start_time = primaryRange.start;
  }
  if (primaryRange?.end) {
    payload.endTime = primaryRange.end;
    payload.end_time = primaryRange.end;
  }

  if (normalizedWeekday != null) {
    payload.weekday = normalizedWeekday;
  }

  if (payload.icon == null) {
    delete payload.icon;
  }
  if (payload.color == null || payload.color === "") {
    delete payload.color;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
};

const saveWeeklyTaskViaApiFallback = async (resolved, taskData, sanitizedRanges) => {
  const { ownerUid: resolvedOwnerUid, targetUid, teamId, sessionUid } = resolved;
  const ownerUid = resolvedOwnerUid || targetUid || sessionUid || getUid();
  if (!ownerUid) {
    throw new Error('Utilisateur non connecté');
  }

  if (!Array.isArray(sanitizedRanges) || sanitizedRanges.length === 0) {
    throw new Error('Au moins un créneau horaire valide est requis');
  }

  const apiFetch = await getApiFetch();
  const normalizedPrice = normalizeWeeklyTaskPrice(taskData?.price);

  const normalizedWeekday = normalizeWeekdayValue(taskData?.weekday ?? sanitizedRanges[0]?.day ?? null);

  const body = {
    label: typeof taskData?.label === 'string' && taskData.label.trim()
      ? taskData.label.trim()
      : undefined,
    title: typeof taskData?.title === 'string' && taskData.title.trim()
      ? taskData.title.trim()
      : undefined,
    price: normalizedPrice,
    color: taskData?.color ?? null,
    icon: taskData?.icon ?? null,
    priority: normalizeTaskPriority(taskData?.priority),
    status: normalizeTaskStatus(taskData?.status),
    time_ranges: sanitizedRanges.map((range) => {
      const normalizedWeekday = normalizeWeekdayValue(range.weekday ?? range.day ?? null) ?? range.day;
      const payloadRange = {
        day: range.day,
        start: range.start,
        end: range.end,
        weekday: normalizedWeekday,
      };

      const normalizedDate = normalizeTaskDateField(range.task_date ?? range.task_day_iso ?? null);
      if (normalizedDate) {
        payloadRange.task_date = normalizedDate;
        payloadRange.task_day_iso = normalizedDate;
      }

      return payloadRange;
    }),
    member_uid: ownerUid,
  };

  const primaryRange = sanitizedRanges[0];

  if (primaryRange?.start) {
    body.start_time = primaryRange.start;
    body.startTime = primaryRange.start;
  }
  if (primaryRange?.end) {
    body.end_time = primaryRange.end;
    body.endTime = primaryRange.end;
  }

  if (normalizedWeekday != null) {
    body.weekday = normalizedWeekday;
  }

  if (teamId) {
    body.team_id = teamId;
  }

  if (body.icon == null) {
    delete body.icon;
  }
  if (body.color == null || body.color === '') {
    delete body.color;
  }
  if (!body.label && !body.title) {
    body.label = 'Tâche sans titre';
  }

  const method = taskData?.id ? 'PUT' : 'POST';
  const path = taskData?.id
    ? `/planning/v2/weekly-tasks/${taskData.id}`
    : '/planning/v2/weekly-tasks';

  const response = await apiFetch(path, {
    method,
    body: JSON.stringify(body),
  });

  if (!response || response.success === false) {
    const message = response?.error || 'Impossible de sauvegarder la tâche hebdomadaire';
    throw new Error(message);
  }

  const rawTask = response.task || response;
  const viewerUid = sessionUid || getUid();

  return normalizeWeeklyTaskData(
    rawTask.id || taskData?.id || rawTask.uid || `${ownerUid}-${body.label || body.title || 'task'}`,
    rawTask,
    ownerUid,
    teamId || null,
    viewerUid,
  );
};

const toIsoDateString = (value) => {
  const date = toDateSafe(value);
  if (!date) {
    return null;
  }
  return date.toISOString();
};

const buildFallbackQueryParams = (context, fromDate, toDate) => {
  const params = new URLSearchParams();
  if (fromDate) {
    const iso = toIsoDateString(fromDate);
    if (iso) {
      params.set('from', iso);
    }
  }
  if (toDate) {
    const iso = toIsoDateString(toDate);
    if (iso) {
      params.set('to', iso);
    }
  }
  if (context?.type === 'team') {
    if (context.teamId) {
      params.set('team_id', context.teamId);
    }
    if (context.memberUid) {
      params.set('member_uid', context.memberUid);
    }
  }
  return params;
};


const fetchPlanningEventsFallback = async (context, fromDate, toDate) => {
  try {
    const params = buildFallbackQueryParams(context, fromDate, toDate);
    const apiFetch = await getApiFetch();
    const query = params.toString();
    const response = await apiFetch(`/planning/v2/events${query ? `?${query}` : ''}`);
    const events = Array.isArray(response?.events) ? response.events : [];
    const viewerUid = getUid();
    const teamId = context?.type === 'team' ? context.teamId ?? null : null;
    const defaultOwner = context?.type === 'team' ? context.memberUid : context?.userId;

    return events
      .map((event) => {
        const ownerUid = event.owner_uid || event.user_id || defaultOwner || viewerUid;
        return normalizeEventData(event.id || event.uid || `${ownerUid}-${event.start}`, event, ownerUid, teamId, viewerUid);
      })
      .filter(Boolean);
  } catch (error) {
    console.error('fetchPlanningEventsFallback error', error);
    throw error;
  }
};

const fetchWeeklyTasksFallback = async (context) => {
  try {
    const params = new URLSearchParams();
    if (context?.type === 'team') {
      if (context.teamId) {
        params.set('team_id', context.teamId);
      }
      if (context.memberUid) {
        params.set('member_uid', context.memberUid);
      }
    }
    const apiFetch = await getApiFetch();
    const query = params.toString();
    const response = await apiFetch(`/planning/v2/weekly-tasks${query ? `?${query}` : ''}`);
    const tasks = Array.isArray(response?.tasks) ? response.tasks : [];
    const viewerUid = getUid();
    const teamId = context?.type === 'team' ? context.teamId ?? null : null;
    const defaultOwner = context?.type === 'team' ? context.memberUid : context?.userId;

    return tasks
      .map((task) => {
        const ownerUid = task.owner_uid || task.user_id || defaultOwner || viewerUid;
        return normalizeWeeklyTaskData(task.id || task.uid || `${ownerUid}-${task.label || task.name || 'task'}`, task, ownerUid, teamId, viewerUid);
      })
      .filter(Boolean);
  } catch (error) {
    console.error('fetchWeeklyTasksFallback error', error);
    throw error;
  }
};

export const fetchWeeklyTasksOnce = async (context) => {
  try {
    const tasks = await fetchWeeklyTasksFallback(context);
    return Array.isArray(tasks) ? tasks : [];
  } catch (error) {
    console.warn('fetchWeeklyTasksOnce error', error);
    return [];
  }
};

const buildRangeFromIso = (startIso, endIso) => {
  if (!startIso || !endIso) {
    return null;
  }
  const from = new Date(startIso + 'T00:00:00');
  const to = new Date(endIso + 'T23:59:59');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  return { from, to };
};


export const watchPlanningEventsInRange = (context, range, onData, onError) => {
  if (!range?.from || !range?.to) {
    onData?.([]);
    return () => {};
  }

  const fromDate = normalizeDate(range.from);
  const toDate = normalizeDate(range.to);
  if (
    !(fromDate instanceof Date) ||
    Number.isNaN(fromDate.getTime()) ||
    !(toDate instanceof Date) ||
    Number.isNaN(toDate.getTime())
  ) {
    onData?.([]);
    return () => {};
  }

  let effectiveContext = context;
  let unsubscribe = null;
  let removeRestart = null;
  let active = true;

  const cleanupSubscription = () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const cleanupRestart = () => {
    if (typeof removeRestart === 'function') {
      removeRestart();
      removeRestart = null;
    }
  };

  const pathForResolvedContext = (resolved) => {
    if (!resolved) {
      return null;
    }
    if (resolved.planningCollectionPath) {
      return resolved.planningCollectionPath;
    }
    const viewerUid = resolved.sessionUid || getUid();
    return viewerUid ? `users/${viewerUid}/planningEvents` : null;
  };

  const startSubscription = async () => {
    try {
      const resolved = await ensurePlanningContext(effectiveContext);
      if (!active) {
        return;
      }

      if (!resolved || resolved.status === 'deferred') {
        cleanupSubscription();
        cleanupRestart();
        onData?.([]);
        removeRestart = registerPlanningAuthRestart(() => {
          if (!active) {
            return;
          }
          startSubscription();
        });
        return;
      }

      cleanupRestart();

      const { baseRef, targetUid, sessionUid, readOnly, teamId, type, memberUid: resolvedMemberUid } = resolved;
      const path = pathForResolvedContext(resolved);

      const shouldUseFallbackOnly = !baseRef;

      cleanupSubscription();

      effectiveContext = {
        ...(effectiveContext || {}),
        type: type || effectiveContext?.type || 'personal',
        userId: targetUid,
        memberUid: resolvedMemberUid || targetUid,
        ownerUid: targetUid,
        teamId: teamId || null,
      };

      const fromTimestamp = Timestamp.fromDate(fromDate);
      const toTimestamp = Timestamp.fromDate(toDate);
      const constraints = [
        where('start', '>=', fromTimestamp),
        where('start', '<=', toTimestamp),
        orderBy('start', 'asc'),
      ];

      console.info('planningEvents subscribe', {
        sessionUid,
        targetUid,
        path,
        readOnly,
        realtime: !shouldUseFallbackOnly,
      });

      if (shouldUseFallbackOnly) {
        try {
          const fallbackEvents = await fetchPlanningEventsFallback(
            effectiveContext,
            fromDate,
            toDate,
          );
          if (!active) {
            return;
          }
          onData?.(Array.isArray(fallbackEvents) ? fallbackEvents : []);
        } catch (fallbackError) {
          console.error('planningEvents fallback-only error', fallbackError);
          onError?.(fallbackError);
        }
        return;
      }

      const handleSnapshot = (snapshot) => {
        const events = snapshot.docs
          .map((docSnap) => normalizeEventDocument(docSnap, targetUid, teamId || null, sessionUid))
          .filter(Boolean);
        onData?.(events);
      };

      const handleError = async (error) => {
        const isPermissionIssue = isPermissionDeniedError(error);
        const logPath = path || 'planningEvents';
        logPermissionError(logPath, sessionUid || getUid(), error, { toast: false, level: 'warn' });
        const logFn = isPermissionIssue ? console.warn : console.error;
        logFn('onSnapshot planningEvents', { path: logPath, targetUid }, error);
        if (isPermissionIssue) {
          try {
            const fallbackEvents = await fetchPlanningEventsFallback(
              effectiveContext,
              fromDate,
              toDate,
            );
            if (!active) {
              return;
            }
            if (fallbackEvents) {
              onData?.(fallbackEvents);
              return;
            }
          } catch (fallbackError) {
            console.error('planningEvents fallback failed', fallbackError);
          }
        }
        onError?.(error);
      };

      const rawUnsubscribe = onSnapshot(query(baseRef, ...constraints), handleSnapshot, handleError);
      unsubscribe = registerPlanningListener(rawUnsubscribe);
    } catch (error) {
      if (!active) {
        return;
      }
      onError?.(error);
    }
  };

  startSubscription();

  return () => {
    active = false;
    cleanupSubscription();
    cleanupRestart();
  };
};

export const watchWeekEvents = (context, weekStartISO, weekEndISO, onData, onError) => {
  const range = buildRangeFromIso(weekStartISO, weekEndISO);
  if (!range) {
    onData?.([]);
    return () => {};
  }
  return watchPlanningEventsInRange(context, range, onData, onError);
};

export const fetchWeekEventsOnce = async (context, weekStartISO, weekEndISO) => {
  const range = buildRangeFromIso(weekStartISO, weekEndISO);
  if (!range) {
    return [];
  }
  try {
    return await fetchPlanningEventsFallback(context, range.from, range.to);
  } catch (error) {
    console.warn('fetchWeekEventsOnce error', error);
    return [];
  }
};


// Écriture client : uniquement les événements personnels. Pour une équipe, déléguer au backend.
export const saveEventNew = async (context, eventData = {}) => {
  const resolved = await ensurePlanningContext(context);
  if (!resolved || resolved.status === 'deferred') {
    throw new Error('Utilisateur non connecté');
  }

  const { sessionUid, readOnly } = resolved;
  const currentUid = sessionUid || getUid();
  if (!currentUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (!eventData) {
    eventData = {};
  }
  if (readOnly) {
    throw new Error('Contexte planning accessible uniquement en lecture');
  }

  const explicitTeamId = eventData.team_id;
  const teamId = explicitTeamId && explicitTeamId !== '' ? explicitTeamId : null;
  const resolvedTeamId = resolved.teamId || null;
  const effectiveTeamId = teamId || resolvedTeamId;

  const startTs = toFirestoreTimestamp(eventData.start);
  const endTs = toFirestoreTimestamp(eventData.end);
  if (!startTs || !endTs) {
    throw new Error("Dates invalides pour l'événement");
  }

  const payload = {
    ...eventData,
    start: startTs,
    end: endTs,
    user_id: currentUid,
    owner_uid: currentUid,
    team_id: null,
    updated_at: serverTimestamp(),
  };

  delete payload.id;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  if (effectiveTeamId) {
    return saveEventViaApiFallback(
      { ownerUid: currentUid, teamId: effectiveTeamId, type: 'team' },
      eventData,
      startTs,
      endTs,
    );
  }

  const eventsCollection = collection(db, 'users', currentUid, 'planningEvents');

  try {
    if (eventData.id) {
      const docRef = doc(eventsCollection, eventData.id);
      await setDoc(docRef, payload, { merge: true });
      return {
        ...eventData,
        id: eventData.id,
        start: startTs.toDate(),
        end: endTs.toDate(),
        user_id: currentUid,
        owner_uid: currentUid,
        team_id: null,
        source: 'firestore',
      };
    }

    const docRef = await addDoc(eventsCollection, {
      ...payload,
      created_at: serverTimestamp(),
    });
    return {
      ...eventData,
      id: docRef.id,
      start: startTs.toDate(),
      end: endTs.toDate(),
      user_id: currentUid,
      owner_uid: currentUid,
      team_id: null,
      source: 'firestore',
    };
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
    return saveEventViaApiFallback(
      { ownerUid: currentUid, teamId: null, type: 'personal' },
      eventData,
      startTs,
      endTs,
    );
  }
};


// Suppression client : uniquement sur users/<uid>/planningEvents.
export const deleteEventNew = async (context, eventId) => {
  if (!eventId) {
    throw new Error("Identifiant de l'événement requis");
  }

  const resolved = await ensurePlanningContext(context);
  if (!resolved || resolved.status === 'deferred') {
    throw new Error('Utilisateur non connecté');
  }

  const { sessionUid, readOnly, teamId } = resolved;
  if (!sessionUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (readOnly) {
    throw new Error('Contexte planning accessible uniquement en lecture');
  }
  if (teamId) {
    return deleteEventViaApiFallback(resolved, eventId);
  }

  const eventsCollection = collection(db, 'users', sessionUid, 'planningEvents');
  try {
    await deleteDoc(doc(eventsCollection, eventId));
    return { success: true, source: 'firestore', id: eventId };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return deleteEventViaApiFallback(resolved, eventId);
    }
    throw error;
  }
};


export const saveWeeklyTask = async (context, taskData = {}) => {
  if (!taskData || typeof taskData !== 'object') {
    throw new Error('Données de tâche hebdomadaire invalides');
  }

  const resolved = await ensurePlanningContext(context);
  if (!resolved || resolved.status === 'deferred') {
    throw new Error('Utilisateur non connecté');
  }

  const { weeklyTasksRef, sessionUid, readOnly, teamId, ownerUid: resolvedOwnerUid, targetUid } = resolved;
  if (!sessionUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (readOnly) {
    throw new Error('Contexte planning accessible uniquement en lecture');
  }

  const ownerUid = resolvedOwnerUid || targetUid || sessionUid;
  if (!ownerUid) {
    throw new Error('Utilisateur non connecté');
  }

  const sanitizedRanges = sanitizeWeeklyTaskTimeRanges(taskData.time_ranges);
  if (!sanitizedRanges.length) {
    throw new Error('Au moins un créneau horaire valide est requis');
  }

  const normalizedTaskData = {
    ...taskData,
    time_ranges: sanitizedRanges,
    weekday: normalizeWeekdayValue(taskData?.weekday ?? sanitizedRanges[0]?.day ?? null),
    priority: normalizeTaskPriority(taskData?.priority),
    status: normalizeTaskStatus(taskData?.status),
  };
  const payload = buildWeeklyTaskPayload(normalizedTaskData, ownerUid, teamId || null, sanitizedRanges);

  const attemptFallbackSave = async () =>
    saveWeeklyTaskViaApiFallback(resolved, normalizedTaskData, sanitizedRanges);

  if (!weeklyTasksRef) {
    return attemptFallbackSave();
  }

  try {
    if (normalizedTaskData.id) {
      const docRef = doc(weeklyTasksRef, normalizedTaskData.id);
      await setDoc(docRef, payload, { merge: true });
      return normalizeWeeklyTaskData(
        normalizedTaskData.id,
        { ...normalizedTaskData, ...payload, time_ranges: sanitizedRanges },
        ownerUid,
        teamId || null,
        sessionUid,
      );
    }

    const docRef = await addDoc(weeklyTasksRef, {
      ...payload,
      created_at: serverTimestamp(),
    });

    return normalizeWeeklyTaskData(
      docRef.id,
      { ...normalizedTaskData, ...payload, time_ranges: sanitizedRanges },
      ownerUid,
      teamId || null,
      sessionUid,
    );
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      try {
        return await attemptFallbackSave();
      } catch (fallbackError) {
        logPermissionError('weeklyTasks', sessionUid, fallbackError);
        throw fallbackError;
      }
    }
    logPermissionError('weeklyTasks', sessionUid, error);
    throw error;
  }
};

export const deleteWeeklyTask = async (context, taskId) => {
  if (!taskId) {
    throw new Error('Identifiant de la tâche requis');
  }

  const resolved = await ensurePlanningContext(context);
  if (!resolved || resolved.status === 'deferred') {
    throw new Error('Utilisateur non connecté');
  }

  const { weeklyTasksRef, sessionUid, readOnly } = resolved;
  if (!sessionUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (readOnly) {
    throw new Error('Contexte planning accessible uniquement en lecture');
  }

  try {
    await deleteDoc(doc(weeklyTasksRef, taskId));
  } catch (error) {
    logPermissionError('weeklyTasks', sessionUid, error);
    throw error;
  }
};


export const watchWeeklyTasksForContext = (context, onData, onError) => {
  let effectiveContext = context;
  let unsubscribe = null;
  let removeRestart = null;
  let active = true;

  const cleanupSubscription = () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const cleanupRestart = () => {
    if (typeof removeRestart === 'function') {
      removeRestart();
      removeRestart = null;
    }
  };

  const startSubscription = async () => {
    try {
      const resolved = await ensurePlanningContext(effectiveContext);
      if (!active) {
        return;
      }

      if (!resolved || resolved.status === 'deferred') {
        cleanupSubscription();
        cleanupRestart();
        onData?.([]);
        removeRestart = registerPlanningAuthRestart(() => {
          if (!active) {
            return;
          }
          startSubscription();
        });
        return;
      }

      cleanupRestart();

      const { weeklyTasksRef, targetUid, teamId, sessionUid, type, memberUid: resolvedMemberUid } = resolved;
      cleanupSubscription();

      effectiveContext = {
        ...(effectiveContext || {}),
        type: type || effectiveContext?.type || 'personal',
        userId: targetUid,
        memberUid: resolvedMemberUid || targetUid,
        ownerUid: targetUid,
        teamId: teamId || null,
      };

      const shouldUseFallbackOnly = !weeklyTasksRef;

      if (shouldUseFallbackOnly) {
        try {
          const fallbackTasks = await fetchWeeklyTasksFallback(effectiveContext);
          if (!active) {
            return;
          }
          onData?.(Array.isArray(fallbackTasks) ? fallbackTasks : []);
        } catch (fallbackError) {
          console.error('weeklyTasks fallback-only error', fallbackError);
          onError?.(fallbackError);
        }
        return;
      }

      let fallbackAttempted = false;
      const handleError = async (error) => {
        if (isPermissionDeniedError(error) && !fallbackAttempted) {
          fallbackAttempted = true;
          try {
            const fallbackTasks = await fetchWeeklyTasksFallback(effectiveContext);
            if (!active) {
              return;
            }
            if (fallbackTasks) {
              onData?.(fallbackTasks);
              return;
            }
          } catch (fallbackError) {
            console.error('weeklyTasks fallback failed', fallbackError);
          }
        }
        logPermissionError('weeklyTasks', sessionUid, error);
        onError?.(error);
      };

      const handleSnapshot = (snapshot) => {
        const viewerUid = sessionUid || getUid();
        const tasks = snapshot.docs
          .map((docSnap) => normalizeWeeklyTaskDocument(docSnap, targetUid, teamId || null, viewerUid))
          .filter(Boolean);
        onData?.(tasks);
      };

      const rawUnsubscribe = onSnapshot(weeklyTasksRef, handleSnapshot, handleError);
      unsubscribe = registerPlanningListener(rawUnsubscribe);
    } catch (error) {
      if (!active) {
        return;
      }
      onError?.(error);
    }
  };

  startSubscription();

  return () => {
    active = false;
    cleanupSubscription();
    cleanupRestart();
  };
};

export const getWeekRange = (weekStart) => {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { from: start, to: end };
};

export const getMonthRange = (year, month) => {
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(year, month + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { from: start, to: end };
};

window.auth = auth;


