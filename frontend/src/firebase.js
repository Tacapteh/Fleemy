import { initializeApp } from "firebase/app";
import { useEffect, useState } from "react";
import { getAuth, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
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

// Contexte utilisateur (placeholder pour compatibilité)
export const setUserContext = () => {};

// Utilitaire pour normaliser les dates
const normalizeDate = (date) => {
  if (!date) return null;
  if (date instanceof Timestamp) {
    return date.toDate().toISOString();
  }
  if (date instanceof Date) {
    return date.toISOString();
  }
  if (typeof date === 'string') {
    return new Date(date).toISOString();
  }
  return date;
};

const toDate = (dateValue) => {
  if (!dateValue) return null;
  if (dateValue instanceof Timestamp) {
    return dateValue.toDate();
  }
  if (dateValue instanceof Date) {
    return dateValue;
  }
  return new Date(dateValue);
};

// EVENTS
export const saveEvent = async (eventData) => {
  try {
    const uid = auth.currentUser.uid;
    const eventsCol = collection(db, 'users', uid, 'events');
    const id = eventData.id || doc(eventsCol).id;

    const normalizedEvent = {
      ...eventData,
      id,
      start: normalizeDate(eventData.start),
      end: normalizeDate(eventData.end),
      owner_id: uid,
      createdAt: eventData.createdAt || new Date().toISOString(),
      title: eventData.title || 'Événement sans titre',
      color: eventData.color || '#3b82f6',
      description: eventData.description || ''
    };

    await setDoc(doc(eventsCol, id), normalizedEvent);

    return normalizedEvent;
  } catch (error) {
    console.error('Erreur saveEvent:', error);
    throw error;
  }
};

export const watchEvents = (range, callback) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    console.warn('Aucun utilisateur connecté pour watchEvents');
    return () => {};
  }

  try {
    const eventsRef = collection(db, 'users', uid, 'events');
    const rangeStart = normalizeDate(range.from);
    const rangeEnd = normalizeDate(range.to);
    
    const q = query(
      eventsRef,
      where('start', '<=', rangeEnd),
      where('end', '>=', rangeStart),
      orderBy('start')
    );

    const seenIds = new Set();
    
    return onSnapshot(q, (snapshot) => {
      const events = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const eventId = doc.id;
        
        if (!seenIds.has(eventId)) {
          seenIds.add(eventId);
          
          events.push({
            ...data,
            id: eventId,
            start: toDate(data.start),
            end: toDate(data.end)
          });
        }
      });
      
      callback(events);
    }, (error) => {
      console.error('Erreur watchEvents:', error);
      callback([]);
    });
  } catch (error) {
    console.error('Erreur config watchEvents:', error);
    return () => {};
  }
};

export const deleteEvent = async (eventId) => {
  try {
    const uid = auth.currentUser.uid;
    const eventRef = doc(db, 'users', uid, 'events', eventId);
    await deleteDoc(eventRef);
  } catch (error) {
    console.error('Erreur deleteEvent:', error);
    throw error;
  }
};

// TASKS
export const saveTask = async (taskData) => {
  try {
    const uid = auth.currentUser.uid;
    const tasksCol = collection(db, 'users', uid, 'tasks');
    const id = taskData.id || doc(tasksCol).id;

    const normalizedTask = {
      ...taskData,
      id,
      start: normalizeDate(taskData.start),
      end: normalizeDate(taskData.end),
      owner_id: uid,
      createdAt: taskData.createdAt || new Date().toISOString(),
      title: taskData.title || 'Tâche sans titre',
      color: taskData.color || '#10b981',
      description: taskData.description || '',
      icon: taskData.icon || '📋',
      price: taskData.price || null
    };

    await setDoc(doc(tasksCol, id), normalizedTask);

    return normalizedTask;
  } catch (error) {
    console.error('Erreur saveTask:', error);
    throw error;
  }
};

export const watchTasks = (range, callback) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    console.warn('Aucun utilisateur connecté pour watchTasks');
    return () => {};
  }

  try {
    const tasksRef = collection(db, 'users', uid, 'tasks');
    const rangeStart = normalizeDate(range.from);
    const rangeEnd = normalizeDate(range.to);
    
    const q = query(
      tasksRef,
      where('start', '<=', rangeEnd),
      where('end', '>=', rangeStart),
      orderBy('start')
    );

    const seenIds = new Set();
    
    return onSnapshot(q, (snapshot) => {
      const tasks = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const taskId = doc.id;
        
        if (!seenIds.has(taskId)) {
          seenIds.add(taskId);
          
          tasks.push({
            ...data,
            id: taskId,
            start: toDate(data.start),
            end: toDate(data.end)
          });
        }
      });
      
      callback(tasks);
    }, (error) => {
      console.error('Erreur watchTasks:', error);
      callback([]);
    });
  } catch (error) {
    console.error('Erreur config watchTasks:', error);
    return () => {};
  }
};

export const deleteTask = async (taskId) => {
  try {
    const uid = auth.currentUser.uid;
    const taskRef = doc(db, 'users', uid, 'tasks', taskId);
    await deleteDoc(taskRef);
  } catch (error) {
    console.error('Erreur deleteTask:', error);
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
