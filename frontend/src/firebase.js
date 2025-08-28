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

export const pathFor = (collectionName) => {
  const uid = auth.currentUser?.uid;
  const path = currentTeamId
    ? `teams/${currentTeamId}/${collectionName}`
    : `users/${uid}/${collectionName}`;
  console.log(
    `pathFor(${collectionName}) projectId=${projectId} uid=${uid} path=${path}`
  );
  return path;
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
  const currentUid = getUid();

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
  const path = pathFor("events");

  try {
    const ref = await addDoc(collection(db, path), data);
    return { id: ref.id, ...data };
  } catch (error) {
    console.error("saveEvent", path, error);
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

  const eventsPath = pathFor("events");
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

  const fromTimestamp = Timestamp.fromDate(fromDate);
  const toTimestamp = Timestamp.fromDate(toDateVal);

  const q = query(
    collection(db, eventsPath),
    where("user_id", "==", currentUid),
    where("start", "<=", toTimestamp),
    where("end", ">=", fromTimestamp),
    orderBy("start", "asc")
  );

  try {
    unsubEvents = onSnapshot(
      q,
      (snapshot) => {
        if (!logged) {
          console.log("watchEvents OK", eventsPath);
          logged = true;
        }
        const events = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const start =
            data.start instanceof Timestamp ? data.start.toDate() : data.start;
          const end = data.end instanceof Timestamp ? data.end.toDate() : data.end;
          events.push({ ...data, id: docSnap.id, start, end });
        });
        callback(events);
      },
      (err) => {
        console.error("watchEvents", eventsPath, err.message);
        callback([]);
      }
    );
    return unsubEvents;
  } catch (err) {
    console.error("watchEvents", eventsPath, err.message);
    return () => {};
  }
};

export const deleteEvent = async (eventId) => {
  if (readOnlyGuard()) return;
  try {
    const eventRef = doc(collection(db, pathFor("events")), eventId);
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

  const q = query(
    collection(db, tasksPath),
    where("user_id", "==", currentUid),
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
          tasks.push({ ...data, id: docSnap.id, start, end });
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

// NOUVELLES FONCTIONS DEMANDÉES

/**
 * Sauvegarde un event dans Firestore avec la structure plannings/${userId}_${YYYY-MM-DD}
 * @param {string} userId - UID de l'utilisateur
 * @param {string} dateISO - Date au format YYYY-MM-DD (local, sans heure)
 * @param {object} partial - Données partielles de l'event
 */
export const saveEventNew = async (userId, dateISO, partial) => {
  if (readOnlyGuard()) return;
  const uid = userId || getUid();
  if (!uid || !dateISO) {
    console.error('saveEventNew: userId et dateISO requis');
    return;
  }

  try {
    const eventId =
      partial.id || `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

    const slot = {
      id: eventId,
      start: partial.start || new Date().toISOString(),
      end: partial.end || new Date(Date.now() + 3600000).toISOString(),
      client: partial.client || '',
      status: partial.status || 'unpaid',
      hourly_rate: partial.hourly_rate || 50,
      duration: partial.duration || 60,
      task_id: partial.task_id || null,
      updated_at: Timestamp.now(),
      user_id: uid,
      team_id: currentTeamId || null,
      created_at: serverTimestamp(),
      ...partial
    };

    const fixedSlots = { [eventId]: slot };
    const planningDocId = `${uid}_${dateISO}`;
    const planningRef = doc(db, 'plannings', planningDocId);

    const payload = { user_id: uid, team_id: currentTeamId || null, created_at: serverTimestamp(), slots: fixedSlots };

    await setDoc(planningRef, payload, { merge: true });

    console.log(`Event ${eventId} sauvegardé dans plannings/${planningDocId}`);
    return slot;

  } catch (error) {
    logPermissionError(`plannings/${uid}_${dateISO}`, uid, error);
    throw error;
  }
};

/**
 * Supprime un event de Firestore
 * @param {string} userId - UID de l'utilisateur
 * @param {string} dateISO - Date au format YYYY-MM-DD
 * @param {string} eventId - ID de l'event à supprimer
 */
export const deleteEventNew = async (userId, dateISO, eventId) => {
  if (readOnlyGuard()) return;
  const uid = userId || getUid();
  if (!uid || !dateISO || !eventId) {
    console.error('deleteEventNew: tous les paramètres sont requis');
    return;
  }

  try {
    const planningDocId = `${uid}_${dateISO}`;
    const planningRef = doc(db, 'plannings', planningDocId);

    await setDoc(
      planningRef,
      {
        user_id: uid,
        team_id: currentTeamId || null,
        created_at: serverTimestamp(),
        slots: { [eventId]: null }
      },
      { merge: true }
    );

    console.log(`Event ${eventId} supprimé de plannings/${planningDocId}`);

  } catch (error) {
    logPermissionError(`plannings/${uid}_${dateISO}`, uid, error);
    throw error;
  }
};

/**
 * Écoute les events d'une semaine avec déduplication et tri
 * @param {string} userId - UID de l'utilisateur  
 * @param {string} weekStartISO - Date de début (YYYY-MM-DD)
 * @param {string} weekEndISO - Date de fin (YYYY-MM-DD)
 * @param {function} onData - Callback avec les events triés et dédupliqués
 * @param {function} onError - Callback d'erreur
 * @returns {function} Fonction unsubscribe
 */
export const watchWeekEvents = (userId, weekStartISO, weekEndISO, onData, onError) => {
  if (!userId || !weekStartISO || !weekEndISO) {
    console.error('watchWeekEvents: tous les paramètres sont requis');
    return () => {};
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error('watchWeekEvents: utilisateur non authentifié');
    if (onError) onError(new Error('Utilisateur non authentifié'));
    return () => {};
  }

  try {
    // Générer toutes les dates de la semaine
    const startDate = new Date(weekStartISO + 'T00:00:00');
    const endDate = new Date(weekEndISO + 'T23:59:59');
    const dates = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
      dates.push(`${userId}_${dateStr}`);
    }

    // Écouter tous les documents de planning de la semaine
    const unsubscribes = [];
    const eventsMap = new Map(); // Pour déduplication par ID

    const updateEvents = () => {
      // Convertir la Map en array, trier par start, et appeler onData
      const allEvents = Array.from(eventsMap.values())
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      
      if (onData) {
        onData(allEvents);
      }
    };

    // Créer un listener pour chaque document de planning
    dates.forEach(planningDocId => {
      const planningRef = doc(db, 'plannings', planningDocId);
      
      const unsubscribe = onSnapshot(
        planningRef,
        (snapshot) => {
          const data = snapshot.data();

          if (data && data.slots) {
            Object.values(data.slots).forEach(event => {
              if (event && event.id) {
                eventsMap.set(event.id, event);
              }
            });
          }

          updateEvents();
        },
        (error) => {
          logPermissionError(planningRef.path, userId, error);
          if (onError) onError(error);
        }
      );

      unsubscribes.push(unsubscribe);
    });

    // Retourner fonction de désabonnement
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };

  } catch (error) {
    logPermissionError('plannings', userId, error);
    if (onError) onError(error);
    return () => {};
  }
};

export { googleProvider, logout };

window.auth = auth;
