import { useEffect, useState } from "react";
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
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

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
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
const getUid = () => auth.currentUser?.uid || null;
export { getUid };

const recentErrors = new Map();

const logPermissionError = (path, uid, err) => {
  if (err?.code !== "permission-denied") return;
  const key = `${path}|${err.message}`;
  const now = Date.now();
  if (!recentErrors.has(key) || now - recentErrors.get(key) > 3000) {
    console.error(`Permission error path=${path} uid=${uid}:`, err.message);
    showToast("Accès refusé : vérifiez vos règles ou l'UID du document", true);
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

const toHourMinuteString = (value, fallback = DEFAULT_EVENT_START) => {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    if (value.includes("T")) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return `${String(parsed.getHours()).padStart(2, "0")}:${String(
          parsed.getMinutes(),
        ).padStart(2, "0")}`;
      }
    }
    const parts = value.split(":");
    if (parts.length > 0) {
      const rawHour = Number.parseInt(parts[0], 10);
      const rawMinute = Number.parseInt(parts[1] ?? "0", 10);
      if (!Number.isNaN(rawHour)) {
        const hour = Math.max(0, Math.min(rawHour, 23));
        const minute = Math.max(0, Math.min(Number.isNaN(rawMinute) ? 0 : rawMinute, 59));
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      }
    }
  }

  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, "0")}:${String(
        value.getMinutes(),
      ).padStart(2, "0")}`;
    }
  }

  const date = toDateSafe(value);
  if (date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
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
    status: eventData.status || eventData.type || "pending",
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
    status: rawEvent?.status ?? eventData.status ?? eventData.type ?? "pending",
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

const ensurePlanningContext = (context) => {
  if (context?.type === 'personal' || !context) {
    const ownerUid = context?.userId || getUid();
    if (!ownerUid) {
      throw new Error('Planning context requires authenticated user');
    }
    return {
      type: 'personal',
      ownerUid,
      memberUid: ownerUid,
      teamId: null,
      eventsRef: collection(db, 'users', ownerUid, 'planningEvents'),
      weeklyTasksRef: collection(db, 'users', ownerUid, 'weeklyTasks'),
    };
  }

  if (context.type === 'team') {
    const teamId = context.teamId;
    const memberUid = context.memberUid;
    if (!teamId || !memberUid) {
      throw new Error('Team planning context requires teamId and memberUid');
    }
    return {
      type: 'team',
      ownerUid: memberUid,
      memberUid,
      teamId,
      eventsRef: collection(db, 'teams', teamId, 'members', memberUid, 'planningEvents'),
      weeklyTasksRef: collection(db, 'teams', teamId, 'members', memberUid, 'weeklyTasks'),
    };
  }

  throw new Error('Unsupported planning context');
};

const ensureTeamMemberContainer = async (teamId, memberUid) => {
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
    console.warn("ensureTeamMemberContainer error", error);
  }
};

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

  return {
    ...data,
    id,
    start: startValue,
    end: endValue,
    user_id: resolvedOwner,
    owner_uid: resolvedOwner,
    team_id: teamId ?? data.team_id ?? null,
    readOnly: viewerUid ? resolvedOwner !== viewerUid : true,
  };
};

const normalizeEventDocument = (docSnap, ownerUid, teamId, viewerUid) => {
  if (!docSnap || !docSnap.exists()) {
    return null;
  }
  return normalizeEventData(docSnap.id, docSnap.data(), ownerUid, teamId, viewerUid);
};

const normalizeWeeklyTaskData = (id, data, ownerUid, teamId, viewerUid) => {
  if (!data) {
    return null;
  }

  const resolvedOwner = data.owner_uid || data.user_id || ownerUid;

  return {
    id,
    label: data.label || data.title || data.name || 'Tâche sans titre',
    title: data.title || data.label || data.name || 'Tâche sans titre',
    price: data.price ?? null,
    color: data.color || data.colorCode || '#dbeafe',
    icon: data.icon || data.emoji || '📋',
    time_ranges: Array.isArray(data.time_ranges)
      ? data.time_ranges
      : Array.isArray(data.time_slots)
      ? data.time_slots
      : [],
    weekly: true,
    user_id: resolvedOwner,
    owner_uid: resolvedOwner,
    team_id: teamId ?? data.team_id ?? null,
    readOnly: viewerUid ? resolvedOwner !== viewerUid : true,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  };
};

const normalizeWeeklyTaskDocument = (docSnap, ownerUid, teamId, viewerUid) => {
  if (!docSnap || !docSnap.exists()) {
    return null;
  }
  return normalizeWeeklyTaskData(docSnap.id, docSnap.data(), ownerUid, teamId, viewerUid);
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

const REALTIME_FALLBACK_INTERVAL_MS = 5000;

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
  try {
    const resolved = ensurePlanningContext(context);
    const { eventsRef, ownerUid, teamId } = resolved;

    if (!range?.from || !range?.to) {
      onData?.([]);
      return () => {};
    }

    const fromDate = normalizeDate(range.from);
    const toDate = normalizeDate(range.to);
    if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime()) || !(toDate instanceof Date) || Number.isNaN(toDate.getTime())) {
      onData?.([]);
      return () => {};
    }

    const constraints = [
      where('start', '>=', Timestamp.fromDate(fromDate)),
      where('start', '<=', Timestamp.fromDate(toDate)),
      orderBy('start', 'asc'),
    ];

    const startSubscription = () => {
      let stopFallback = null;
      let fallbackErrorNotified = false;
      let hasRetriedAfterEnsure = false;
      let closed = false;

      const stopExistingFallback = () => {
        if (typeof stopFallback === 'function') {
          stopFallback();
        }
        stopFallback = null;
      };

      const ensureViewerMembership = () => {
        if (!teamId) {
          return Promise.resolve();
        }
        const viewerUid = getUid();
        if (!viewerUid) {
          return Promise.resolve();
        }
        return ensureTeamMemberContainer(teamId, viewerUid).catch((membershipError) => {
          console.warn('watchPlanningEvents ensure membership error', membershipError);
        });
      };

      const startFallback = () => {
        if (closed) {
          return () => {};
        }
        if (stopFallback) {
          return stopFallback;
        }

        let cancelled = false;
        let timer = null;

        const fetchAndEmit = async () => {
          try {
            const fallbackEvents = await fetchPlanningEventsFallback(context, fromDate, toDate);
            if (!cancelled && fallbackEvents) {
              fallbackErrorNotified = false;
              onData?.(fallbackEvents);
            }
          } catch (fallbackError) {
            if (!cancelled) {
              console.error('planningEvents fallback failed', fallbackError);
              if (!fallbackErrorNotified) {
                onError?.(fallbackError);
                fallbackErrorNotified = true;
              }
            }
          }
        };

        fetchAndEmit();
        timer = setInterval(fetchAndEmit, REALTIME_FALLBACK_INTERVAL_MS);

        stopFallback = () => {
          cancelled = true;
          if (timer) {
            clearInterval(timer);
          }
          timer = null;
        };

        return stopFallback;
      };

      const handleSnapshot = (snapshot) => {
        stopExistingFallback();
        const viewerUid = getUid();
        const events = snapshot.docs
          .map((docSnap) => normalizeEventDocument(docSnap, ownerUid, teamId, viewerUid))
          .filter(Boolean);
        onData?.(events);
      };

      let unsubscribe = () => {};

      const subscribeRealtime = () => {
        if (closed) {
          return;
        }
        try {
          if (typeof unsubscribe === 'function') {
            unsubscribe();
          }
          unsubscribe = onSnapshot(query(eventsRef, ...constraints), handleSnapshot, handleError);
        } catch (error) {
          handleError(error);
          unsubscribe = () => {};
        }
      };

      const handleError = (error) => {
        if (error?.code === 'permission-denied') {
          if (!hasRetriedAfterEnsure) {
            hasRetriedAfterEnsure = true;
            ensureViewerMembership()
              .catch(() => {})
              .finally(() => {
                if (closed) {
                  return;
                }
                if (typeof unsubscribe === 'function') {
                  unsubscribe();
                }
                subscribeRealtime();
              });
            return;
          }
          logPermissionError('planningEvents', getUid(), error);
          startFallback();
          return;
        }
        stopExistingFallback();
        logPermissionError('planningEvents', getUid(), error);
        onError?.(error);
      };

      subscribeRealtime();

      return () => {
        closed = true;
        stopExistingFallback();
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    };

    if (teamId) {
      const viewerUid = getUid();
      let unsubscribe = () => {};
      let active = true;

      ensureTeamMemberContainer(teamId, viewerUid)
        .catch((membershipError) => {
          console.warn('watchPlanningEvents ensure membership error', membershipError);
        })
        .finally(() => {
          if (!active) {
            return;
          }
          unsubscribe = startSubscription();
        });

      return () => {
        active = false;
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }

    return startSubscription();
  } catch (error) {
    onError?.(error);
    return () => {};
  }
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

export const saveEventNew = async (context, eventData = {}) => {
  const resolved = ensurePlanningContext(context);
  const { eventsRef, ownerUid, teamId, type } = resolved;
  const currentUid = getUid();

  if (!currentUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (type === 'team' && ownerUid !== currentUid) {
    throw new Error("Impossible de modifier le planning d'un autre membre");
  }

  const startTs = toFirestoreTimestamp(eventData.start);
  const endTs = toFirestoreTimestamp(eventData.end);
  if (!startTs || !endTs) {
    throw new Error('Dates invalides pour l\'événement');
  }

  const payload = {
    ...eventData,
    start: startTs,
    end: endTs,
    user_id: ownerUid,
    owner_uid: ownerUid,
    team_id: teamId ?? null,
    updated_at: serverTimestamp(),
  };

  delete payload.id;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  try {
    if (teamId) {
      await ensureTeamMemberContainer(teamId, ownerUid);
    }

    if (eventData.id) {
      await setDoc(doc(eventsRef, eventData.id), payload, { merge: true });
      return {
        ...eventData,
        id: eventData.id,
        start: startTs.toDate(),
        end: endTs.toDate(),
        user_id: ownerUid,
        owner_uid: ownerUid,
        team_id: teamId ?? null,
        source: "firestore",
      };
    }

    const newDocRef = doc(eventsRef);
    await setDoc(newDocRef, {
      ...payload,
      created_at: serverTimestamp(),
    });
    return {
      ...eventData,
      id: newDocRef.id,
      start: startTs.toDate(),
      end: endTs.toDate(),
      user_id: ownerUid,
      owner_uid: ownerUid,
      team_id: teamId ?? null,
      source: "firestore",
    };
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
    try {
      return await saveEventViaApiFallback(resolved, eventData, startTs, endTs);
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
};

export const deleteEventNew = async (context, eventId) => {
  const resolved = ensurePlanningContext(context);
  const { eventsRef, ownerUid, type } = resolved;
  const currentUid = getUid();

  if (!currentUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (!eventId) {
    throw new Error('Identifiant de l\'événement requis');
  }
  if (type === 'team' && ownerUid !== currentUid) {
    throw new Error("Impossible de modifier le planning d'un autre membre");
  }

  await deleteDoc(doc(eventsRef, eventId));
};

export const watchWeeklyTasksForContext = (context, onData, onError) => {
  try {
    const resolved = ensurePlanningContext(context);
    const { weeklyTasksRef, ownerUid, teamId } = resolved;

    const startSubscription = () => {
      let fallbackAttempted = false;
      return onSnapshot(
        weeklyTasksRef,
        (snapshot) => {
          const viewerUid = getUid();
          const tasks = snapshot.docs
            .map((docSnap) => normalizeWeeklyTaskDocument(docSnap, ownerUid, teamId, viewerUid))
            .filter(Boolean);
          onData?.(tasks);
        },
        async (error) => {
          if (error?.code === 'permission-denied' && !fallbackAttempted) {
            fallbackAttempted = true;
            try {
              const fallbackTasks = await fetchWeeklyTasksFallback(context);
              if (fallbackTasks) {
                onData?.(fallbackTasks);
                return;
              }
            } catch (fallbackError) {
              console.error('weeklyTasks fallback failed', fallbackError);
            }
          }
          logPermissionError('weeklyTasks', getUid(), error);
          onError?.(error);
        }
      );
    };

    if (teamId) {
      const viewerUid = getUid();
      let unsubscribe = () => {};
      let active = true;

      ensureTeamMemberContainer(teamId, viewerUid)
        .catch((membershipError) => {
          console.warn('watchWeeklyTasks ensure membership error', membershipError);
        })
        .finally(() => {
          if (!active) {
            return;
          }
          unsubscribe = startSubscription();
        });

      return () => {
        active = false;
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }

    return startSubscription();
  } catch (error) {
    onError?.(error);
    return () => {};
  }
};

export const fetchWeeklyTasksOnce = async (context) => {
  try {
    return await fetchWeeklyTasksFallback(context);
  } catch (error) {
    console.warn('fetchWeeklyTasksOnce error', error);
    return [];
  }
};

export const saveWeeklyTask = async (context, taskData = {}) => {
  const resolved = ensurePlanningContext(context);
  const { weeklyTasksRef, ownerUid, teamId, type } = resolved;
  const currentUid = getUid();

  if (!currentUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (type === 'team' && ownerUid !== currentUid) {
    throw new Error("Impossible de modifier les tâches d'un autre membre");
  }

  if (!Array.isArray(taskData.time_ranges) || taskData.time_ranges.length === 0) {
    throw new Error('Les tâches hebdomadaires doivent contenir au moins un créneau');
  }

  const payload = {
    label: taskData.label || taskData.title || 'Tâche sans titre',
    title: taskData.title || taskData.label || 'Tâche sans titre',
    price: taskData.price || null,
    color: taskData.color || '#dbeafe',
    icon: taskData.icon || 'briefcase',
    weekly: true,
    time_ranges: taskData.time_ranges,
    user_id: ownerUid,
    owner_uid: ownerUid,
    team_id: teamId ?? null,
    updated_at: serverTimestamp(),
  };

  delete payload.id;
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  if (teamId) {
    await ensureTeamMemberContainer(teamId, ownerUid);
  }

  if (taskData.id) {
    await setDoc(doc(weeklyTasksRef, taskData.id), payload, { merge: true });
    showToast('Tâche hebdomadaire mise à jour');
    return { id: taskData.id, ...payload };
  }

  const newDocRef = doc(weeklyTasksRef);
  await setDoc(newDocRef, {
    ...payload,
    created_at: serverTimestamp(),
  });
  showToast('Tâche hebdomadaire créée');
  return { id: newDocRef.id, ...payload };
};

export const deleteWeeklyTask = async (context, taskId) => {
  const resolved = ensurePlanningContext(context);
  const { weeklyTasksRef, ownerUid, type } = resolved;
  const currentUid = getUid();

  if (!currentUid) {
    throw new Error('Utilisateur non connecté');
  }
  if (!taskId) {
    throw new Error('Identifiant de la tâche requis');
  }
  if (type === 'team' && ownerUid !== currentUid) {
    throw new Error("Impossible de modifier les tâches d'un autre membre");
  }

  await deleteDoc(doc(weeklyTasksRef, taskId));
  showToast('Tâche hebdomadaire supprimée');
};

const buildMembershipEntries = (entries = []) => {
  const mapped = Array.isArray(entries) ? entries : [];
  return mapped
    .map((entry) => {
      if (!entry) return null;
      const uid = entry.uid || entry.user_id || entry.userId;
      if (!uid) return null;
      return {
        uid,
        displayName: entry.displayName || entry.name || null,
        email: entry.email || null,
      };
    })
    .filter(Boolean);
};

export const listenTeamMemberships = (teamId, onData, onError) => {
  if (!teamId) {
    onData?.([]);
    return () => {};
  }

  let stopFallback = null;
  const stopExistingFallback = () => {
    if (typeof stopFallback === 'function') {
      stopFallback();
    }
    stopFallback = null;
  };

  let unsubscribeRealtime = () => {};
  let cancelled = false;
  let ensuredMembershipPromise = null;
  let hasRetriedAfterEnsure = false;

  const ensureMembership = () => {
    if (!teamId || cancelled) {
      return Promise.resolve();
    }
    if (!ensuredMembershipPromise) {
      ensuredMembershipPromise = (async () => {
        const currentUid = getUid();
        if (!currentUid) {
          return;
        }
        try {
          await ensureTeamMemberContainer(teamId, currentUid);
        } catch (error) {
          console.warn('listenTeamMemberships ensure membership error', error);
        }
      })();
    }
    return ensuredMembershipPromise;
  };

  const startFallback = () => {
    if (cancelled) {
      return () => {};
    }
    if (stopFallback) {
      return stopFallback;
    }

    let cancelled = false;
    let timer = null;

    const fetchMembers = async () => {
      try {
        const apiFetch = await getApiFetch();
        const response = await apiFetch(`/teams/${teamId}/memberships`);
        if (cancelled) {
          return;
        }
        const members = buildMembershipEntries(response?.members);
        onData?.(members);
      } catch (error) {
        if (!cancelled) {
          console.error('fallback fetchTeamMemberships error', error);
          onError?.(error);
        }
      }
    };

    fetchMembers();
    timer = setInterval(fetchMembers, 60_000);

    stopFallback = () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
      timer = null;
    };

    return stopFallback;
  };

  const membershipsRef = collection(db, 'teams', teamId, 'memberships');

  const handleSnapshot = (snapshot) => {
    stopExistingFallback();
    const members = snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...(docSnap.data() || {}) }));
    const normalized = buildMembershipEntries(members);
    onData?.(normalized);
  };

  const handleError = (error) => {
    if (error?.code === 'permission-denied') {
      if (!hasRetriedAfterEnsure) {
        hasRetriedAfterEnsure = true;
        ensureMembership()
          .catch(() => {})
          .finally(() => {
            if (cancelled) {
              return;
            }
            try {
              if (typeof unsubscribeRealtime === 'function') {
                unsubscribeRealtime();
              }
              unsubscribeRealtime = onSnapshot(membershipsRef, handleSnapshot, handleError);
            } catch (retryError) {
              handleError(retryError);
            }
          });
        return;
      }
      console.warn('listenTeamMemberships permission denied, switching to API fallback');
      stopExistingFallback();
      startFallback();
      return;
    }
    logPermissionError('teamMemberships', getUid(), error);
    onError?.(error);
  };

  const subscribeRealtime = () => {
    if (cancelled) {
      return;
    }
    try {
      if (typeof unsubscribeRealtime === 'function') {
        unsubscribeRealtime();
      }
      unsubscribeRealtime = onSnapshot(membershipsRef, handleSnapshot, handleError);
    } catch (error) {
      handleError(error);
      unsubscribeRealtime = () => {};
    }
  };

  ensureMembership().finally(() => {
    if (!cancelled) {
      subscribeRealtime();
    }
  });

  return () => {
    cancelled = true;
    stopExistingFallback();
    if (typeof unsubscribeRealtime === 'function') {
      unsubscribeRealtime();
    }
  };
};

export const fetchUserProfile = async (uid) => {
  if (!uid) {
    return null;
  }

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      return { uid, displayName: null, email: null };
    }
    const data = snap.data();
    return {
      uid,
      displayName:
        data?.name ||
        data?.displayName ||
        data?.full_name ||
        data?.fullName ||
        null,
      email: data?.email || null,
    };
  } catch (error) {
    console.error('fetchUserProfile error', error);
    return { uid, displayName: null, email: null };
  }
};

// TASKS (existing function remains unchanged)
export const saveTask = async (taskData = {}) => {
  const currentUid = getUid();
  if (!currentUid) {
    throw new Error('Utilisateur non connecté');
  }

  const baseData = {
    ...taskData,
    start: normalizeDate(taskData.start),
    end: normalizeDate(taskData.end),
    user_id: currentUid,
    team_id: currentTeamId || null,
    // Only set created_at for new tasks
    ...(taskData.id ? {} : { created_at: serverTimestamp() }),
  };
  const id = taskData.id;
  delete baseData.id;
  Object.keys(baseData).forEach((k) => baseData[k] === undefined && delete baseData[k]);

  const data = baseData;
  const path = "tasks";

  try {
    if (id) {
      const ref = doc(collection(db, path), id);
      await setDoc(ref, data, { merge: true });
      return { id, ...data };
    } else {
      const ref = await addDoc(collection(db, path), data);
      return { id: ref.id, ...data };
    }
  } catch (error) {
    console.error("saveTask", path, error);
    return;
  }
};

export const watchTasks = (range, callback) => {
  const currentUid = getUid();
  if (!range?.from || !range?.to || !currentUid) {
    if (unsubTasks) {
      unsubTasks();
      unsubTasks = null;
    }
    console.log("watchTasks skip: bad range/user");
    return () => {};
  }
  if (unsubTasks) {
    unsubTasks();
    unsubTasks = null;
  }

  const fromDate = normalizeDate(range.from);
  const toDateVal = normalizeDate(range.to);
  if (
    !(fromDate instanceof Date) ||
    isNaN(fromDate.getTime()) ||
    !(toDateVal instanceof Date) ||
    isNaN(toDateVal.getTime())
  ) {
    console.log("watchTasks skip: bad range/user");
    return () => {};
  }

  const fromTimestamp = Timestamp.fromDate(fromDate);
  const toTimestamp = Timestamp.fromDate(toDateVal);

  const field = currentTeamId ? "team_id" : "user_id";
  const fieldValue = currentTeamId ? currentTeamId : currentUid;

  let logged = false;

  const tasksPath = "tasks";
  const q = query(
    collection(db, tasksPath),
    where(field, "==", fieldValue),
    where("weekly", "!=", true), // Exclure les tâches hebdomadaires
    where("start", "<=", toTimestamp),
    orderBy("weekly", "asc"), // Nécessaire pour la contrainte d'inégalité
    orderBy("start", "asc")
  );

  const unsubRoot = onSnapshot(
    q,
    (snapshot) => {
      if (!logged) {
        console.log("watchTasks OK", tasksPath);
        logged = true;
      }
      const tasks = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Ignorer les tâches hebdomadaires même si elles passent le filtre
        if (data.weekly === true) return;
        
        const start =
          data.start instanceof Timestamp ? data.start.toDate() : data.start;
        const end = data.end instanceof Timestamp ? data.end.toDate() : data.end;
        if (end >= fromDate) {
          const readOnly = data.user_id !== currentUid;
          tasks.push({ ...data, id: docSnap.id, start, end, readOnly });
        }
      });
      callback(tasks);
    },
    (err) => {
      logPermissionError(tasksPath, currentUid, err);
      callback([]);
    }
  );

  unsubTasks = unsubRoot;
  return unsubRoot;
};

export const deleteTask = async (taskId) => {
  try {
    const taskRef = doc(collection(db, "tasks"), taskId);
    await deleteDoc(taskRef);
  } catch (error) {
    console.error("Erreur deleteTask:", error);
    throw error;
  }
};

// Utilitaires
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


