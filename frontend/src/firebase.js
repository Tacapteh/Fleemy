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
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBNNGQf0tz3mtnDL-E0dEYSi9ce34lZkDw",
  authDomain: "fleemy-21118.firebaseapp.com",
  projectId: "fleemy-21118",
  storageBucket: "fleemy-21118.appspot.com",
  messagingSenderId: "273204841300",
  appId: "1:273204841300:web:15f50e65c64dd87cb556c1",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const projectId = app.options.projectId;
console.log("FB projectId", projectId);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

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
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    console.log("skip: no user");
    return;
  }

  const baseData = {
    ...eventData,
    start: normalizeDate(eventData.start),
    end: normalizeDate(eventData.end),
  };
  delete baseData.id;
  Object.keys(baseData).forEach((k) => baseData[k] === undefined && delete baseData[k]);
  baseData.owner_id = currentUid;
  if (currentTeamId) baseData.team_id = currentTeamId;

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
    where("owner_id", "==", currentUid),
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
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    console.log("skip: no user");
    return;
  }

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
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    console.log("skip: no user");
    return;
  }

  const baseData = {
    ...taskData,
    start: normalizeDate(taskData.start),
    end: normalizeDate(taskData.end),
  };
  delete baseData.id;
  Object.keys(baseData).forEach((k) => baseData[k] === undefined && delete baseData[k]);
  baseData.owner_id = currentUid;
  if (currentTeamId) baseData.team_id = currentTeamId;

  const data = baseData;
  const path = pathFor("tasks");

  try {
    const ref = await addDoc(collection(db, path), data);
    return { id: ref.id, ...data };
  } catch (error) {
    console.error("saveTask", path, error);
    return;
  }
};

export const watchTasks = (range, callback) => {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || !range?.from || !range?.to) {
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

  const tasksPath = pathFor("tasks");
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
    where("owner_id", "==", currentUid),
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
        console.error("watchTasks", tasksPath, err.message);
        callback([]);
      }
    );
    return unsubTasks;
  } catch (err) {
    console.error("watchTasks", tasksPath, err.message);
    return () => {};
  }
};

export const deleteTask = async (taskId) => {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    console.log("skip: no user");
    return;
  }

  try {
    const taskRef = doc(collection(db, pathFor("tasks")), taskId);
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

export { googleProvider, logout };

window.auth = auth;
