import { useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
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
  setDoc,
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

export function useFirebaseUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
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
  if (currentTeamId) {
    console.log(`pathFor: teams/${currentTeamId}/${collectionName}`);
    return `teams/${currentTeamId}/${collectionName}`;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Utilisateur non authentifié");
  }
  console.log(`pathFor: users/${uid}/${collectionName}`);
  return `users/${uid}/${collectionName}`;
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

// Supprime le champ id et les clés undefined
const scrub = (obj) => {
  const { id, ...rest } = obj || {};
  return Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined)
  );
};

// EVENTS
export const saveEvent = async (eventData = {}) => {
  if (!auth.currentUser) {
    throw new Error("Utilisateur non authentifié");
  }

  try {
    const baseData = {
      ...eventData,
      start: normalizeDate(eventData.start),
      end: normalizeDate(eventData.end),
      owner_id: auth.currentUser.uid,
      title: eventData.title ?? "Événement sans titre",
      color: eventData.color ?? "#3b82f6",
      description: eventData.description ?? "",
      createdAt: eventData.createdAt ?? new Date(),
    };
    if (currentTeamId) baseData.team_id = currentTeamId;
    const data = scrub(baseData);

    const colRef = collection(db, pathFor("events"));

    if (eventData.id) {
      const docRef = doc(colRef, eventData.id);
      await setDoc(docRef, data, { merge: true });
      return { id: eventData.id, ...data };
    }

    const docRef = await addDoc(colRef, data);
    return { id: docRef.id, ...data };
  } catch (error) {
    console.error("Erreur saveEvent:", error);
    throw error;
  }
};

export const watchEvents = (range, callback) => {
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }

  if (!auth.currentUser || !range?.from || !range?.to) {
    return () => {};
  }

  const eventsPath = pathFor("events");

  const fromDate = normalizeDate(range.from);
  const toDateVal = normalizeDate(range.to);

  if (
    !fromDate ||
    !toDateVal ||
    isNaN(fromDate.getTime()) ||
    isNaN(toDateVal.getTime())
  ) {
    return () => {};
  }

  const fromTimestamp = Timestamp.fromDate(fromDate);
  const toTimestamp = Timestamp.fromDate(toDateVal);

  const eventsRef = collection(db, eventsPath);

  const constraints = [
    where("owner_id", "==", auth.currentUser.uid),
    toTimestamp && where("start", "<=", toTimestamp),
    fromTimestamp && where("end", ">=", fromTimestamp),
    orderBy("start", "asc"),
  ].filter(Boolean);
  const q = query(eventsRef, ...constraints);

  try {
    unsubEvents = onSnapshot(
      q,
      (snapshot) => {
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
  if (!auth.currentUser) {
    throw new Error("Utilisateur non authentifié");
  }

  try {
    const uid = auth.currentUser.uid;
    const eventRef = doc(db, "users", uid, "events", eventId);
    await deleteDoc(eventRef);
  } catch (error) {
    console.error("Erreur deleteEvent:", error);
    throw error;
  }
};

// TASKS
export const saveTask = async (taskData = {}) => {
  if (!auth.currentUser) {
    throw new Error("Utilisateur non authentifié");
  }

  try {
    const baseData = {
      ...taskData,
      start: normalizeDate(taskData.start),
      end: normalizeDate(taskData.end),
      owner_id: auth.currentUser.uid,
      title: taskData.title ?? "Tâche sans titre",
      color: taskData.color ?? "#10b981",
      description: taskData.description ?? "",
      icon: taskData.icon ?? "📋",
      price: taskData.price ?? null,
      createdAt: taskData.createdAt ?? new Date(),
    };
    if (currentTeamId) baseData.team_id = currentTeamId;
    const data = scrub(baseData);

    const colRef = collection(db, pathFor("tasks"));

    if (taskData.id) {
      const docRef = doc(colRef, taskData.id);
      await setDoc(docRef, data, { merge: true });
      return { id: taskData.id, ...data };
    }

    const docRef = await addDoc(colRef, data);
    return { id: docRef.id, ...data };
  } catch (error) {
    console.error("Erreur saveTask:", error);
    throw error;
  }
};

export const watchTasks = (range, callback) => {
  if (unsubTasks) {
    unsubTasks();
    unsubTasks = null;
  }

  if (!auth.currentUser || !range?.from || !range?.to) {
    return () => {};
  }

  const tasksPath = pathFor("tasks");

  const fromDate = normalizeDate(range.from);
  const toDateVal = normalizeDate(range.to);

  if (
    !fromDate ||
    !toDateVal ||
    isNaN(fromDate.getTime()) ||
    isNaN(toDateVal.getTime())
  ) {
    return () => {};
  }

  const fromTimestamp = Timestamp.fromDate(fromDate);
  const toTimestamp = Timestamp.fromDate(toDateVal);

  const tasksRef = collection(db, tasksPath);

  const constraints = [
    where("owner_id", "==", auth.currentUser.uid),
    toTimestamp && where("start", "<=", toTimestamp),
    fromTimestamp && where("end", ">=", fromTimestamp),
    orderBy("start", "asc"),
  ].filter(Boolean);
  const q = query(tasksRef, ...constraints);

  try {
    unsubTasks = onSnapshot(
      q,
      (snapshot) => {
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
  if (!auth.currentUser) {
    throw new Error("Utilisateur non authentifié");
  }

  try {
    const uid = auth.currentUser.uid;
    const taskRef = doc(db, "users", uid, "tasks", taskId);
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

export { auth, googleProvider, db, logout };

window.auth = auth;
