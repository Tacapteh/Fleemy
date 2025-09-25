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
const getUid = () => auth.currentUser?.uid || null;
export { getUid };

const recentErrors = new Map();

const readOnlyGuard = () => {
  // En mode démo, on autorise les opérations (elles seront mockées)
  if (DEMO_MODE) {
    return false; // Autoriser les opérations
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
  where(currentTeamId ? "team_id" : "user_id", "==", currentTeamId || currentUid),
  where("start", ">=", weekStartTs),
  where("start", "<", weekEndTs),
  orderBy("start"),
];


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

// SYSTÈME DE STOCKAGE DEMO POUR LES TÂCHES HEBDOMADAIRES
const DEMO_TASKS_KEY = 'demo_weekly_tasks';

const getDemoTasks = () => {
  try {
    const tasks = localStorage.getItem(DEMO_TASKS_KEY);
    return tasks ? JSON.parse(tasks) : [];
  } catch (e) {
    console.error('Erreur lecture tâches démo:', e);
    return [];
  }
};

const saveDemoTasks = (tasks) => {
  try {
    localStorage.setItem(DEMO_TASKS_KEY, JSON.stringify(tasks));
    // Déclencher un événement personnalisé pour notifier les hooks
    window.dispatchEvent(new CustomEvent('demo-tasks-updated'));
  } catch (e) {
    console.error('Erreur sauvegarde tâches démo:', e);
  }
};

// TASKS HEBDOMADAIRES
export const saveWeeklyTask = async (taskData = {}) => {
  if (readOnlyGuard()) return;
  const currentUid = getUid();

  if (!taskData.time_ranges || !Array.isArray(taskData.time_ranges) || taskData.time_ranges.length === 0) {
    console.error("Les tâches hebdomadaires doivent avoir time_ranges");
    return;
  }

  const baseData = {
    label: taskData.title || taskData.label || 'Tâche sans titre',
    price: taskData.price || null,
    color: taskData.color || 'pastel-blue',
    icon: taskData.icon || 'briefcase',
    weekly: true,
    time_ranges: taskData.time_ranges,
    user_id: currentUid,
    created_at: taskData.id ? undefined : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Nettoyer les valeurs undefined
  Object.keys(baseData).forEach((k) => baseData[k] === undefined && delete baseData[k]);

  // En mode démo, utiliser le localStorage
  if (DEMO_MODE) {
    try {
      let tasks = getDemoTasks();
      
      if (taskData.id) {
        // Mise à jour
        const index = tasks.findIndex(t => t.id === taskData.id);
        if (index !== -1) {
          tasks[index] = { id: taskData.id, ...baseData };
        }
      } else {
        // Création
        const newTask = { 
          id: 'demo_task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9), 
          ...baseData 
        };
        tasks.push(newTask);
        baseData.id = newTask.id;
      }
      
      saveDemoTasks(tasks);
      showToast('Tâche hebdomadaire sauvegardée (mode démo)');
      return { id: taskData.id || baseData.id, ...baseData };
    } catch (error) {
      console.error("Erreur sauvegarde tâche démo:", error);
      showToast('Erreur sauvegarde tâche (mode démo)', true);
      throw error;
    }
  }

  // Mode production avec Firestore
  const userTasksPath = `users/${currentUid}/tasks`;
  
  try {
    if (taskData.id) {
      const ref = doc(db, userTasksPath, taskData.id);
      await setDoc(ref, baseData, { merge: true });
      return { id: taskData.id, ...baseData };
    } else {
      const ref = await addDoc(collection(db, userTasksPath), baseData);
      return { id: ref.id, ...baseData };
    }
  } catch (error) {
    console.error("saveWeeklyTask", userTasksPath, error);
    throw error;
  }
};

export const deleteWeeklyTask = async (taskId) => {
  if (readOnlyGuard()) return;
  const currentUid = getUid();
  
  // En mode démo, supprimer du localStorage
  if (DEMO_MODE) {
    try {
      let tasks = getDemoTasks();
      tasks = tasks.filter(t => t.id !== taskId);
      saveDemoTasks(tasks);
      showToast('Tâche hebdomadaire supprimée (mode démo)');
      return;
    } catch (error) {
      console.error("Erreur suppression tâche démo:", error);
      showToast('Erreur suppression tâche (mode démo)', true);
      throw error;
    }
  }
  
  // Mode production
  try {
    const taskRef = doc(db, `users/${currentUid}/tasks`, taskId);
    await deleteDoc(taskRef);
  } catch (error) {
    console.error("Erreur deleteWeeklyTask:", error);
    throw error;
  }
};

// TASKS (existing function remains unchanged)
export const saveTask = async (taskData = {}) => {
  if (readOnlyGuard()) return;
  const currentUid = getUid();

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

  const results = { root: [], weekly: [] };
  const emit = () => callback([...results.root, ...results.weekly]);
  let logged = false;

  const tasksPath = "tasks";
  const q = query(
    collection(db, tasksPath),
    where(field, "==", fieldValue),
    where("start", "<=", toTimestamp),
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
        const start =
          data.start instanceof Timestamp ? data.start.toDate() : data.start;
        const end = data.end instanceof Timestamp ? data.end.toDate() : data.end;
        if (end >= fromDate) {
          const readOnly = data.user_id !== currentUid;
          tasks.push({ ...data, id: docSnap.id, start, end, readOnly });
        }
      });
      results.root = tasks;
      emit();
    },
    (err) => {
      logPermissionError(tasksPath, currentUid, err);
      results.root = [];
      emit();
    }
  );

  const weeklyRef = collection(db, `users/${currentUid}/tasks`);
  const unsubWeekly = onSnapshot(
    weeklyRef,
    (snapshot) => {
      const tasks = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (Array.isArray(data.time_slots)) {
          data.time_slots.forEach((slot, idx) => {
            const date = dateFromISOWeek(data.year, data.week, slot.day);
            if (!date) return;
            if (date < fromDate || date > toDateVal) return;

            const parseSlotTime = (val) => {
              if (val && typeof val.toDate === "function") return val.toDate();
              if (val instanceof Date) return new Date(val);
              if (typeof val === "string" && val.includes(":")) {
                const [hh, mm] = val.split(":").map(Number);
                const d = new Date(date);
                d.setHours(hh, mm || 0, 0, 0);
                return d;
              }
              if (typeof val === "number") {
                const hh = Math.floor(val / 60);
                const mm = val % 60;
                const d = new Date(date);
                d.setHours(hh, mm, 0, 0);
                return d;
              }
              return normalizeDate(val);
            };

            const start = parseSlotTime(slot.start);
            const end = parseSlotTime(slot.end);

            tasks.push({
              id: `${docSnap.id}_${idx}`,
              name: data.name,
              color: data.color,
              icon: data.icon,
              price: data.price,
              start,
              end,
              date,
              readOnly: data.uid !== currentUid,
            });
          });
        }
      });
      results.weekly = tasks;
      emit();
    },
    (err) => {
      logPermissionError(`users/${currentUid}/tasks`, currentUid, err);
      results.weekly = [];
      emit();
    }
  );

  unsubTasks = () => {
    unsubRoot && unsubRoot();
    unsubWeekly && unsubWeekly();
  };
  return unsubTasks;
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


