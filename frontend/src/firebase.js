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

const normalizeEventDocument = (docSnap, ownerUid, teamId, viewerUid) => {
  if (!docSnap || !docSnap.exists()) {
    return null;
  }
  const data = docSnap.data();
  if (!data) {
    return null;
  }

  const startValue = data.start instanceof Timestamp ? data.start.toDate() : new Date(data.start);
  const endValue = data.end instanceof Timestamp ? data.end.toDate() : new Date(data.end);

  if (Number.isNaN(startValue.getTime()) || Number.isNaN(endValue.getTime())) {
    return null;
  }

  const base = {
    ...data,
    id: docSnap.id,
    start: startValue,
    end: endValue,
    user_id: data.user_id || ownerUid,
    owner_uid: data.owner_uid || ownerUid,
    team_id: teamId ?? data.team_id ?? null,
  };

  return {
    ...base,
    readOnly: viewerUid ? ownerUid !== viewerUid : true,
  };
};

const normalizeWeeklyTaskDocument = (docSnap, ownerUid, teamId, viewerUid) => {
  if (!docSnap || !docSnap.exists()) {
    return null;
  }
  const data = docSnap.data();
  if (!data) {
    return null;
  }

  return {
    id: docSnap.id,
    label: data.label || data.title || 'Tâche sans titre',
    title: data.title || data.label || 'Tâche sans titre',
    price: data.price || null,
    color: data.color || data.colorCode || '#dbeafe',
    icon: data.icon || data.emoji || '📋',
    time_ranges: Array.isArray(data.time_ranges) ? data.time_ranges : Array.isArray(data.time_slots) ? data.time_slots : [],
    weekly: true,
    user_id: data.user_id || ownerUid,
    owner_uid: data.owner_uid || ownerUid,
    team_id: teamId ?? data.team_id ?? null,
    readOnly: viewerUid ? ownerUid !== viewerUid : true,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  };
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

    return onSnapshot(
      query(eventsRef, ...constraints),
      (snapshot) => {
        const viewerUid = getUid();
        const events = snapshot.docs
          .map((docSnap) => normalizeEventDocument(docSnap, ownerUid, teamId, viewerUid))
          .filter(Boolean);
        onData?.(events);
      },
      (error) => {
        logPermissionError('planningEvents', getUid(), error);
        onError?.(error);
      }
    );
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
  };
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

    return onSnapshot(
      weeklyTasksRef,
      (snapshot) => {
        const viewerUid = getUid();
        const tasks = snapshot.docs
          .map((docSnap) => normalizeWeeklyTaskDocument(docSnap, ownerUid, teamId, viewerUid))
          .filter(Boolean);
        onData?.(tasks);
      },
      (error) => {
        logPermissionError('weeklyTasks', getUid(), error);
        onError?.(error);
      }
    );
  } catch (error) {
    onError?.(error);
    return () => {};
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

export const listenTeamMemberships = (teamId, onData, onError) => {
  if (!teamId) {
    onData?.([]);
    return () => {};
  }

  try {
    const membershipsRef = collection(db, 'teams', teamId, 'memberships');
    return onSnapshot(
      membershipsRef,
      (snapshot) => {
        const members = snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...(docSnap.data() || {}) }));
        onData?.(members);
      },
      (error) => {
        onError?.(error);
      }
    );
  } catch (error) {
    onError?.(error);
    return () => {};
  }
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


