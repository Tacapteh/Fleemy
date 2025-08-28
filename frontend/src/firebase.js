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
  serverTimestamp,
} from "firebase/firestore";
import { showToast } from "./utils/toast";

const DEMO_MODE = process.env.REACT_APP_DISABLE_GOOGLE_AUTH === "true";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
};

if (process.env.REACT_APP_FIREBASE_STORAGE_BUCKET) {
  firebaseConfig.storageBucket = process.env.REACT_APP_FIREBASE_STORAGE_BUCKET;
}

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"];
const missingConfig = requiredKeys.filter((key) => !firebaseConfig[key]);

if (missingConfig.length) {
  throw new Error(
    `Missing Firebase configuration: ${missingConfig.join(", ")}. ` +
      "Check your REACT_APP_FIREBASE_* environment variables."
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const projectId = app.options.projectId;
console.log("FB projectId", projectId);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const getUid = () => auth.currentUser?.uid || "demo-user";

const recentErrors = new Map();

const readOnlyGuard = () => {
  if (DEMO_MODE) {
    showToast("Mode démo : lecture seule");
    return true;
  }
  return false;
};

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

const logout = async () => {
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

// EVENTS
export const saveEvent = async (eventData = {}) => {
  if (readOnlyGuard()) return;
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return;

  const baseData = {
    ...eventData,
    start: normalizeDate(eventData.start),
    end: normalizeDate(eventData.end),
    user_id: currentUid,
    team_id: currentTeamId || null,
    created_at: serverTimestamp(),
  };
  delete baseData.id;
  Object.keys(baseData).forEach((k) => baseData[k] === undefined && delete baseData[k]);

  const data = baseData;

  try {
    const ref = await addDoc(collection(db, "events"), data);
    return { id: ref.id, ...data };
  } catch (error) {
    console.error("saveEvent", "events", error);
    return;
  }
};

export const watchEvents = (range, callback) => {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || !range?.from || !range?.to) {
    if (unsubEvents) {
      unsubEvents();
      unsubEvents = null;
    }
    console.log("watchEvents skip: bad range/user");
    return () => {};
  }
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }

  let logged = false;

  const fromDate = normalizeDate(range.from);
  const toDateVal = normalizeDate(range.to);
  if (
    !(fromDate instanceof Date) ||
    isNaN(fromDate.getTime()) ||
    !(toDateVal instanceof Date) ||
    isNaN(toDateVal.getTime())
  ) {
    console.log("watchEvents skip: bad range/user");
    return () => {};
  }

  const weekStartTs = Timestamp.fromDate(fromDate);
  const weekEndTs = Timestamp.fromDate(toDateVal);

  const constraints = [
    where("user_id", "==", currentUid),
    where("start", ">=", weekStartTs),
    where("start", "<", weekEndTs),
    orderBy("start"),
  ];

  if (currentTeamId) {
    constraints.push(where("team_id", "==", currentTeamId));
  }

  const q = query(collection(db, "events"), ...constraints);

  try {
    unsubEvents = onSnapshot(
      q,
      (snapshot) => {
        if (!logged) {
          console.log("watchEvents OK", "events");
          logged = true;
        }
        const events = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const start =
            data.start instanceof Timestamp ? data.start.toDate() : data.start;
          const end = data.end instanceof Timestamp ? data.end.toDate() : data.end;
          const readOnly = data.user_id !== currentUid;
          events.push({ ...data, id: docSnap.id, start, end, readOnly });
        });
        callback(events);
      },
      (err) => {
        console.error("watchEvents", "events", err.message);
        callback([]);
      }
    );
    return unsubEvents;
  } catch (err) {
    console.error("watchEvents", "events", err.message);
    return () => {};
  }
};

export const deleteEvent = async (eventId) => {
  if (readOnlyGuard()) return;
  try {
    const eventRef = doc(collection(db, "events"), eventId);
    await deleteDoc(eventRef);
  } catch (error) {
    console.error("Erreur deleteEvent:", error);
    throw error;
  }
};

// TASKS
export const saveTask = async (taskData = {}) => {
  if (readOnlyGuard()) return;
  const currentUid = getUid();

  const baseData = {
    ...taskData,
    start: normalizeDate(taskData.start),
    end: normalizeDate(taskData.end),
    user_id: currentUid,
    team_id: currentTeamId || null,
    created_at: serverTimestamp(),
  };
  delete baseData.id;
  Object.keys(baseData).forEach((k) => baseData[k] === undefined && delete baseData[k]);

  const data = baseData;
  const path = "tasks";

  try {
    const ref = await addDoc(collection(db, path), data);
    return { id: ref.id, ...data };
  } catch (error) {
    console.error("saveTask", path, error);
    return;
  }
};

export const watchTasks = (range, callback) => {
  const currentUid = getUid();
  if (!range?.from || !range?.to) {
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

  const tasksPath = "tasks";
  let logged = false;

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

  const q = query(
    collection(db, tasksPath),
    where(field, "==", fieldValue),
    where("start", "<=", toTimestamp),
    where("end", ">=", fromTimestamp),
    orderBy("start", "asc")
  );

  try {
    unsubTasks = onSnapshot(
      q,
      (snapshot) => {
        if (!logged) {
          console.log("watchTasks OK", tasksPath);
          logged = true;
        }
        const tasks = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const start =
            data.start instanceof Timestamp ? data.start.toDate() : data.start;
          const end = data.end instanceof Timestamp ? data.end.toDate() : data.end;
          const readOnly = data.user_id !== currentUid;
          tasks.push({ ...data, id: docSnap.id, start, end, readOnly });
        });
        callback(tasks);
      },
      (err) => {
        logPermissionError(tasksPath, currentUid, err);
        callback([]);
      }
    );
    return unsubTasks;
  } catch (err) {
    logPermissionError(tasksPath, currentUid, err);
    return () => {};
  }
};

export const deleteTask = async (taskId) => {
  if (readOnlyGuard()) return;
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

// Nouvelles fonctions utilisant la collection "events"
export const saveEventNew = saveEvent;
export const deleteEventNew = deleteEvent;
export const watchWeekEvents = (
  userId,
  weekStartISO,
  weekEndISO,
  onData,
  onError
) => {
  if (!userId || !weekStartISO || !weekEndISO) {
    console.error("watchWeekEvents: tous les paramètres sont requis");
    return () => {};
  }
  try {
    const from = new Date(weekStartISO + "T00:00:00");
    const to = new Date(weekEndISO + "T23:59:59");
    return watchEvents({ from, to }, onData);
  } catch (error) {
    onError && onError(error);
    return () => {};
  }
};

export { googleProvider, logout };

window.auth = auth;

if (typeof window !== "undefined") {
  window.auth = auth;
  window.db = db;
}

