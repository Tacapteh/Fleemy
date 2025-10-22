import { useEffect, useMemo, useState } from 'react';
import { fetchWeeklyTasksOnce, watchWeeklyTasksForContext } from '../firebase';
import { getCachedPlanningData, setCachedPlanningData } from '../utils/planningCache';

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
  dimanche: 6,
};

const TASKS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

const parseTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
};

const contextKeyFromObject = (context) => {
  if (!context) return 'none';
  if (context.type === 'team') {
    return `team:${context.teamId || ''}:${context.memberUid || ''}`;
  }
  if (context.type === 'personal') {
    return `personal:${context.userId || ''}`;
  }
  return 'unknown';
};

export default function useTasks(context, weekStartISO) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const weekDates = useMemo(() => {
    if (!weekStartISO) return null;
    try {
      const monday = new Date(`${weekStartISO}T00:00:00`);
      if (Number.isNaN(monday.getTime())) return null;
      const dates = [];
      for (let i = 0; i < 7; i += 1) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        dates.push(day);
      }
      return dates;
    } catch (err) {
      console.error('useTasks: erreur calcul semaine', err);
      return null;
    }
  }, [weekStartISO]);

  const contextKey = useMemo(() => contextKeyFromObject(context), [context]);

  const tasksCacheKey = useMemo(() => {
    if (!context || !contextKey || contextKey === 'none') {
      return null;
    }
    const weekKey = weekStartISO || 'no-week';
    return `weekly-tasks:${contextKey}:${weekKey}`;
  }, [context, contextKey, weekStartISO]);

  useEffect(() => {
    if (!context || !contextKey || contextKey === 'none') {
      setTasks([]);
      setLoading(false);
      setError(null);
      return () => {};
    }

    let unsubscribe = () => {};
    let cancelled = false;
    let hasRealtimeUpdate = false;

    const cachedTasks = tasksCacheKey ? getCachedPlanningData(tasksCacheKey) : null;
    if (Array.isArray(cachedTasks)) {
      setTasks(cachedTasks);
      setLoading(false);
    } else {
      setTasks([]);
      setLoading(true);
    }
    setError(null);

    const prefetchTasks = async () => {
      if (!tasksCacheKey) {
        return;
      }
      try {
        const fallbackTasks = await fetchWeeklyTasksOnce(context);
        if (cancelled || hasRealtimeUpdate || !Array.isArray(fallbackTasks)) {
          return;
        }
        setTasks(fallbackTasks);
        setLoading(false);
        setCachedPlanningData(tasksCacheKey, fallbackTasks, TASKS_CACHE_TTL);
      } catch (prefetchError) {
        if (!cancelled) {
          console.warn('useTasks: prefetch error', prefetchError);
        }
      }
    };

    prefetchTasks();

    unsubscribe = watchWeeklyTasksForContext(
      context,
      (list) => {
        if (cancelled) {
          return;
        }
        hasRealtimeUpdate = true;
        const normalized = Array.isArray(list) ? list : [];
        setTasks(normalized);
        setLoading(false);
        if (tasksCacheKey) {
          setCachedPlanningData(tasksCacheKey, normalized, TASKS_CACHE_TTL);
        }
      },
      (err) => {
        if (cancelled) {
          return;
        }
        console.error('useTasks: erreur récupération tâches', err);
        setTasks([]);
        setLoading(false);
        if (err?.message?.includes('permissions')) {
          setError('Accès refusé aux tâches hebdomadaires');
        } else {
          setError('Impossible de charger les tâches hebdomadaires');
        }
      }
    );

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [context, contextKey, tasksCacheKey]);

  const occurrences = useMemo(() => {
    if (!tasks.length || !weekDates) {
      return [];
    }

    const results = [];

    tasks.forEach((task) => {
      if (!task || !Array.isArray(task.time_ranges)) {
        return;
      }

      task.time_ranges.forEach((range, index) => {
        const dayIndex = toDayIndex(range.day ?? range.dayIndex ?? range.weekday);
        const start = parseTime(range.start);
        const end = parseTime(range.end);

        if (dayIndex === null || !start || !end) {
          return;
        }

        const dayDate = weekDates[dayIndex];
        if (!dayDate) {
          return;
        }

        const startDate = new Date(dayDate);
        startDate.setHours(start.hours, start.minutes, 0, 0);

        const endDate = new Date(dayDate);
        endDate.setHours(end.hours, end.minutes, 0, 0);

        if (endDate <= startDate) {
          return;
        }

        results.push({
          taskId: task.id,
          occurrenceId: `${task.id}_${index}`,
          dayIndex,
          startDate,
          endDate,
          label: task.label || 'Tâche',
          color: task.color || '#dbeafe',
          icon: task.icon || '📋',
          price: task.price || null,
          readOnly: Boolean(task.readOnly),
          weekly: true,
        });
      });
    });

    return results;
  }, [tasks, weekDates]);

  return {
    tasks,
    occurrences,
    loading,
    error,
  };
}
