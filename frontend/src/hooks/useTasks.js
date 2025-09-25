import { useState, useEffect, useMemo } from 'react';
import { db, getUid } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

// Fonction pour récupérer les tâches démo du localStorage
const getDemoTasks = () => {
  try {
    const tasks = localStorage.getItem('demo_weekly_tasks');
    return tasks ? JSON.parse(tasks) : [];
  } catch (e) {
    console.error('Erreur lecture tâches démo:', e);
    return [];
  }
};

/**
 * Hook pour récupérer et écouter les tâches hebdomadaires d'un utilisateur
 * @param {string} userId - L'ID de l'utilisateur dont on veut récupérer les tâches
 * @param {string} weekStartISO - Date de début de semaine au format ISO (YYYY-MM-DD)
 * @returns {Object} { tasks: Task[], occurrences: TaskOccurrence[], loading: boolean, error: string|null }
 */
export default function useTasks(userId, weekStartISO) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentUid = getUid();

  // Calculer la semaine visible en dates absolues (Europe/Paris)
  const weekDates = useMemo(() => {
    if (!weekStartISO) return null;
    
    try {
      const monday = new Date(weekStartISO + 'T00:00:00');
      if (isNaN(monday.getTime())) return null;
      
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        dates.push(day);
      }
      return dates;
    } catch (e) {
      console.error('Erreur calcul dates semaine:', e);
      return null;
    }
  }, [weekStartISO]);

  // Projeter les time_ranges sur la semaine courante
  const occurrences = useMemo(() => {
    if (!tasks.length || !weekDates) return [];
    
    const result = [];
    
    tasks.forEach(task => {
      // Vérifier que la tâche est hebdomadaire et a des créneaux
      if (!task.weekly || !Array.isArray(task.time_ranges)) return;
      
      task.time_ranges.forEach((range, rangeIndex) => {
        const { day, start, end } = range;
        
        // day doit être entre 0 (lundi) et 6 (dimanche)
        if (typeof day !== 'number' || day < 0 || day > 6) return;
        
        // Valider et parser les heures
        const parseTime = (timeStr) => {
          if (!timeStr || typeof timeStr !== 'string') return null;
          const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
          if (!match) return null;
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
          return { hours, minutes };
        };
        
        const startTime = parseTime(start);
        const endTime = parseTime(end);
        
        if (!startTime || !endTime) return;
        
        // Créer les dates absolues pour cette occurrence
        const dayDate = weekDates[day];
        if (!dayDate) return;
        
        const startDate = new Date(dayDate);
        startDate.setHours(startTime.hours, startTime.minutes, 0, 0);
        
        const endDate = new Date(dayDate);
        endDate.setHours(endTime.hours, endTime.minutes, 0, 0);
        
        // Vérifier que l'heure de fin est après l'heure de début
        if (endDate <= startDate) return;
        
        result.push({
          taskId: task.id,
          occurrenceId: `${task.id}_${rangeIndex}`,
          dayIndex: day,
          startDate,
          endDate,
          label: task.label || 'Tâche sans titre',
          color: task.color || '#dbeafe', // pastel-blue par défaut
          icon: task.icon || '📋',
          price: task.price || null,
          readOnly: task.user_id !== currentUid
        });
      });
    });
    
    return result;
  }, [tasks, weekDates, currentUid]);

  // Écouter les tâches hebdomadaires en temps réel
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Mode démo : utiliser localStorage
    const DEMO_MODE = process.env.REACT_APP_DISABLE_GOOGLE_AUTH === "true";
    if (DEMO_MODE) {
      try {
        const demoTasks = getDemoTasks();
        const tasksList = demoTasks.map(data => ({
          id: data.id,
          user_id: data.user_id || userId,
          label: data.label || data.name || 'Tâche sans titre',
          price: data.price || null,
          color: data.color || '#dbeafe',
          icon: data.icon || '📋',
          weekly: true,
          time_ranges: Array.isArray(data.time_ranges) ? data.time_ranges : [],
          created_at: data.created_at || null,
          updated_at: data.updated_at || null
        }));
        
        setTasks(tasksList);
        setLoading(false);

        // Écouter les changements du localStorage pour les mises à jour en temps réel
        const handleStorageChange = () => {
          const updatedTasks = getDemoTasks();
          const updatedTasksList = updatedTasks.map(data => ({
            id: data.id,
            user_id: data.user_id || userId,
            label: data.label || data.name || 'Tâche sans titre',
            price: data.price || null,
            color: data.color || '#dbeafe',
            icon: data.icon || '📋',
            weekly: true,
            time_ranges: Array.isArray(data.time_ranges) ? data.time_ranges : [],
            created_at: data.created_at || null,
            updated_at: data.updated_at || null
          }));
          setTasks(updatedTasksList);
        };

        // Écouter à la fois storage et événements personnalisés
        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('demo-tasks-updated', handleStorageChange);
        
        return () => {
          window.removeEventListener('storage', handleStorageChange);
          window.removeEventListener('demo-tasks-updated', handleStorageChange);
        };
      } catch (err) {
        console.error('Erreur tâches démo:', err);
        setError('Erreur de récupération des tâches démo');
        setTasks([]);
        setLoading(false);
        return () => {};
      }
    }

    // Mode production : utiliser Firestore
    const tasksPath = `users/${userId}/tasks`;
    
    try {
      const tasksRef = collection(db, tasksPath);
      const q = query(tasksRef, where('weekly', '==', true));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const tasksList = [];
          
          snapshot.forEach((doc) => {
            const data = doc.data();
            
            // Normaliser les données avec des fallbacks sûrs
            const task = {
              id: doc.id,
              user_id: data.user_id || userId,
              label: data.label || data.name || 'Tâche sans titre',
              price: data.price || null,
              color: data.color || '#dbeafe',
              icon: data.icon || '📋',
              weekly: true,
              time_ranges: Array.isArray(data.time_ranges) ? data.time_ranges : 
                          Array.isArray(data.time_slots) ? data.time_slots : [],
              created_at: data.created_at || null,
              updated_at: data.updated_at || null
            };
            
            tasksList.push(task);
          });
          
          setTasks(tasksList);
          setLoading(false);
        },
        (err) => {
          console.error('Erreur écoute tâches hebdomadaires:', err);
          setError(err.message || 'Erreur de récupération des tâches');
          setTasks([]);
          setLoading(false);
        }
      );

      return unsubscribe;
    } catch (err) {
      console.error('Erreur setup écoute tâches:', err);
      setError(err.message || 'Erreur de configuration');
      setLoading(false);
      return () => {};
    }
  }, [userId]);

  return {
    tasks,
    occurrences,
    loading,
    error
  };
}