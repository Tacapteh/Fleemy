import { useState, useEffect, useMemo } from 'react';
import { db, getUid } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

const DAY_NAME_TO_INDEX = {
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
  th: 3,
  jeudi: 3,
  friday: 4,
  fri: 4,
  vendredi: 4,
  saturday: 5,
  sat: 5,
  samedi: 5,
  sunday: 6,
  sun: 6,
  dimanche: 6
};

const toDayIndex = (value) => {
  if (typeof value === 'number' && value >= 0 && value <= 6) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();

    if (/^\d+$/.test(trimmed)) {
      const asNumber = parseInt(trimmed, 10);
      if (!Number.isNaN(asNumber)) {
        if (asNumber >= 0 && asNumber <= 6) return asNumber;
        if (asNumber >= 1 && asNumber <= 7) return (asNumber + 6) % 7;
      }
    }

    if (DAY_NAME_TO_INDEX.hasOwnProperty(trimmed)) {
      return DAY_NAME_TO_INDEX[trimmed];
    }

    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) {
      return (asDate.getDay() + 6) % 7;
    }
  }

  return null;
};

const normalizeTimeRanges = (data = {}) => {
  const candidateRanges = [];

  if (Array.isArray(data.time_ranges)) {
    candidateRanges.push(...data.time_ranges);
  }

  if (Array.isArray(data.time_slots)) {
    candidateRanges.push(...data.time_slots);
  }

  return candidateRanges
    .map((range) => {
      if (!range || typeof range !== 'object') return null;

      const dayCandidate =
        range.day ??
        range.dayIndex ??
        range.day_index ??
        range.day_of_week ??
        range.dayOfWeek ??
        range.weekday;
      const normalizedDay = toDayIndex(dayCandidate);
      if (normalizedDay === null) return null;

      return {
        ...range,
        day: normalizedDay
      };
    })
    .filter(Boolean);
};

const normalizeTaskDocument = (docSnapshot, fallbackUserId, prefetchedData) => {
  if (!docSnapshot || typeof docSnapshot.data !== 'function') return null;

  const data = prefetchedData || docSnapshot.data();
  if (!data || typeof data !== 'object') return null;

  const userId = data.user_id || data.uid || data.owner_id || fallbackUserId || null;
  const timeRanges = normalizeTimeRanges(data);

  return {
    id: docSnapshot.id,
    user_id: userId,
    team_id: data.team_id || null,
    label: data.label || data.title || data.name || 'Tâche sans titre',
    price: data.price || null,
    color: data.color || '#dbeafe',
    icon: data.icon || '📋',
    weekly: data.weekly === undefined ? timeRanges.length > 0 : data.weekly,
    time_ranges: timeRanges,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null
  };
};

/**
 * Hook pour récupérer et écouter les tâches hebdomadaires d'un utilisateur
 * @param {string} userId - L'ID de l'utilisateur dont on veut récupérer les tâches
 * @param {string} weekStartISO - Date de début de semaine au format ISO (YYYY-MM-DD)
 * @returns {Object} { tasks: Task[], occurrences: TaskOccurrence[], loading: boolean, error: string|null }
 */
export default function useTasks(userId, weekStartISO, teamId = null) {
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
    if (!tasks.length || !weekDates) {
      console.log('useTasks: Pas de tâches ou weekDates manquantes', { tasksLength: tasks.length, weekDates });
      return [];
    }
    
    const result = [];
    
    tasks.forEach(task => {
      console.log('useTasks: Traitement tâche', { id: task.id, label: task.label, weekly: task.weekly, time_ranges: task.time_ranges });
      
      // Vérifier que la tâche est hebdomadaire et a des créneaux
      if (!task.weekly || !Array.isArray(task.time_ranges)) {
        console.log('useTasks: Tâche ignorée - pas hebdomadaire ou pas de time_ranges', task.id);
        return;
      }
      
      task.time_ranges.forEach((range, rangeIndex) => {
        const { day, start, end } = range;
        console.log('useTasks: Traitement time_range', { day, start, end, rangeIndex });
        
        // day doit être entre 0 (lundi) et 6 (dimanche)
        if (typeof day !== 'number' || day < 0 || day > 6) {
          console.log('useTasks: Jour invalide', day);
          return;
        }
        
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
        
        if (!startTime || !endTime) {
          console.log('useTasks: Heures invalides', { start, end });
          return;
        }
        
        // Créer les dates absolues pour cette occurrence
        const dayDate = weekDates[day];
        if (!dayDate) {
          console.log('useTasks: Date jour manquante', { day, weekDates });
          return;
        }
        
        const startDate = new Date(dayDate);
        startDate.setHours(startTime.hours, startTime.minutes, 0, 0);
        
        const endDate = new Date(dayDate);
        endDate.setHours(endTime.hours, endTime.minutes, 0, 0);
        
        // Vérifier que l'heure de fin est après l'heure de début
        if (endDate <= startDate) {
          console.log('useTasks: Heure de fin invalide', { startDate, endDate });
          return;
        }
        
        const occurrence = {
          taskId: task.id,
          occurrenceId: `${task.id}_${rangeIndex}`,
          dayIndex: day,
          startDate,
          endDate,
          label: task.label || 'Tâche sans titre',
          color: task.color || '#dbeafe', // pastel-blue par défaut
          icon: task.icon || '📋',
          price: task.price || null,
          readOnly: task.user_id !== currentUid,
          weekly: true
        };
        
        console.log('useTasks: Occurrence créée', occurrence);
        result.push(occurrence);
      });
    });
    
    console.log('useTasks: Total occurrences générées:', result.length, result);
    return result;
  }, [tasks, weekDates, currentUid]);

  // Écouter les tâches hebdomadaires en temps réel
  useEffect(() => {
    console.log('🔍 useTasks useEffect déclenché', { userId, weekStartISO, teamId });

    if (!userId) {
      console.log('⚠️ useTasks: Pas d\'userId, reset des données');
      setTasks([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setTasks([]);

    const sourceTasks = {};

    const updateFromSources = () => {
      const merged = new Map();
      Object.values(sourceTasks).forEach((list) => {
        list.forEach((task) => {
          if (!task || !task.id) return;
          merged.set(task.id, task);
        });
      });

      const mergedTasks = Array.from(merged.values());
      const filteredTasks = mergedTasks.filter((task) => {
        const taskTeamId = task.team_id || null;
        const taskOwnerId = task.user_id || null;

        if (activeTeamId) {
          if (taskTeamId !== activeTeamId) {
            return false;
          }
          if (!userId) {
            return true;
          }
          return taskOwnerId === userId;
        }

        if (taskTeamId) {
          return false;
        }

        if (!userId) {
          return true;
        }

        return taskOwnerId === userId || taskOwnerId === null;
      });

      console.log('📊 useTasks: Mise à jour tasks depuis sources', {
        count: filteredTasks.length,
        taskIds: filteredTasks.map(t => t.id),
        tasks: filteredTasks
      });
      setTasks(filteredTasks);
      setLoading(false);
    };

    const handleSnapshot = (sourceKey) => (snapshot) => {
      console.log('📸 useTasks: Snapshot reçu', { 
        sourceKey, 
        size: snapshot.size, 
        userId,
        empty: snapshot.empty 
      });
      const normalized = [];

      snapshot.forEach((doc) => {
        const rawData = typeof doc.data === 'function' ? doc.data() : null;
        console.log('📄 useTasks: Document brut', { 
          sourceKey, 
          id: doc.id, 
          rawData,
          weekly: rawData?.weekly,
          user_id: rawData?.user_id,
          time_ranges: rawData?.time_ranges
        });
        const task = normalizeTaskDocument(doc, userId, rawData);
        console.log('✅ useTasks: Document normalisé', { sourceKey, id: doc.id, task });
        if (task) {
          normalized.push(task);
        } else {
          console.warn('⚠️ useTasks: Document ignoré (normalisation échouée)', doc.id);
        }
      });

      console.log('📦 useTasks: Tâches normalisées pour', sourceKey, ':', normalized);
      sourceTasks[sourceKey] = normalized;
      updateFromSources();
    };

    const handleError = (sourceKey) => (err) => {
      console.error('❌ useTasks: Erreur écoute tâches', { 
        sourceKey, 
        err,
        code: err?.code,
        message: err?.message 
      });

      sourceTasks[sourceKey] = [];
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        setError('Accès refusé : permissions insuffisantes pour ces tâches.');
      } else if (err?.message && err.message.includes('Firebase')) {
        setError('Configuration Firebase manquante - Impossible de récupérer les tâches');
      } else {
        setError(err?.message || 'Erreur de récupération des tâches');
      }
      updateFromSources();
      setLoading(false);
    };

    const unsubscribers = [];
    const activeTeamId = teamId || null;

    try {
      const globalTasksRef = collection(db, 'tasks');

      const queries = [];

      if (userId) {
        const userQuery = query(globalTasksRef, where('user_id', '==', userId), where('weekly', '==', true));
        console.log('🔍 useTasks: Création query user_id', { userId });
        queries.push({
          key: 'global_user_id',
          ref: userQuery
        });
      }

      if (activeTeamId) {
        const teamQuery = query(globalTasksRef, where('team_id', '==', activeTeamId), where('weekly', '==', true));
        console.log('🔍 useTasks: Création query team_id', { activeTeamId });
        queries.push({
          key: 'global_team_id',
          ref: teamQuery
        });
      }

      console.log('🎯 useTasks: Nombre de queries créées:', queries.length);

      queries.forEach(({ key, ref }) => {
        try {
          console.log('👂 useTasks: Démarrage écoute pour', key);
          unsubscribers.push(onSnapshot(ref, handleSnapshot(key), handleError(key)));
        } catch (err) {
          console.error('❌ useTasks: Erreur création écoute globale', { key, err });
        }
      });
    } catch (err) {
      console.error('❌ useTasks: Erreur accès collection globale tasks', err);
      setError('Erreur d\'accès à la base de données');
      setLoading(false);
    }

    return () => {
      console.log('🧹 useTasks: Nettoyage des écouteurs');
      unsubscribers.forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [userId, teamId]);

  console.log('useTasks: Retour hook', { 
    tasksCount: tasks.length, 
    occurrencesCount: occurrences.length, 
    loading, 
    error,
    weekStartISO,
    userId 
  });

  return {
    tasks,
    occurrences,
    loading,
    error
  };
}
