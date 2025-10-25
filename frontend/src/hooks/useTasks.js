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

const formatDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseTaskDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const clone = new Date(value);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const candidate = trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return parseTaskDate(value.toDate());
  }

  return null;
};

const pickFirstValidDate = (...values) => {
  for (const value of values) {
    const parsed = parseTaskDate(value);
    if (parsed) {
      return parsed;
    }
  }
  return null;
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

const parseTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }
  if (hours === 24) {
    return minutes === 0 ? { hours: 24, minutes: 0 } : null;
  }
  if (hours < 0 || hours > 23) {
    return null;
  }
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

    const weekStartDate = weekDates[0];
    const weekEndDate = weekDates[weekDates.length - 1];

    tasks.forEach((task) => {
      if (!task || !Array.isArray(task.time_ranges)) {
        return;
      }

      const creationDate = pickFirstValidDate(
        task?.dateISO,
        task?.dateIso,
        task?.date_iso,
        task?.creationDate,
        task?.creation_date,
      );

      const hasCreationDate = Boolean(creationDate);

      if (
        hasCreationDate &&
        weekStartDate &&
        weekEndDate &&
        (creationDate < weekStartDate || creationDate > weekEndDate)
      ) {
        return;
      }

      const expectedWeekday = toDayIndex(task.weekday ?? task.week_day ?? task.weekDay);

      task.time_ranges.forEach((range, index) => {
        const dayIndex = toDayIndex(range.day ?? range.dayIndex ?? range.weekday);
        const start = parseTime(range.start);
        const end = parseTime(range.end);

        if (!start || !end) {
          return;
        }

        let computedDayIndex = dayIndex;
        let occurrenceDate = null;

        const explicitDate =
          pickFirstValidDate(
            range.task_date,
            range.taskDate,
            range.task_day_iso,
            range.taskDayIso,
            task.task_date,
            task.task_day_iso,
            !hasCreationDate ? task.taskDate : null,
          ) || null;

        if (explicitDate && weekStartDate && weekEndDate) {
          if (explicitDate < weekStartDate || explicitDate > weekEndDate) {
            return;
          }
          const diffMs = explicitDate.getTime() - weekStartDate.getTime();
          const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
          if (diffDays < 0 || diffDays >= weekDates.length) {
            return;
          }
          computedDayIndex = diffDays;
          occurrenceDate = new Date(explicitDate);
        }

        if (computedDayIndex === null || computedDayIndex < 0 || computedDayIndex >= weekDates.length) {
          return;
        }

        if (!occurrenceDate) {
          const dayDateCandidate = weekDates[computedDayIndex];
          if (!dayDateCandidate) {
            return;
          }
          occurrenceDate = new Date(dayDateCandidate);
        }

        if (expectedWeekday !== null && expectedWeekday !== computedDayIndex) {
          return;
        }

        const startDate = new Date(occurrenceDate);
        startDate.setHours(start.hours, start.minutes, 0, 0);

        const endDate = new Date(occurrenceDate);
        endDate.setHours(end.hours, end.minutes, 0, 0);

        if (endDate <= startDate) {
          return;
        }

        const dateIso = formatDateOnly(occurrenceDate);

        results.push({
          taskId: task.id,
          occurrenceId: `${task.id}_${index}_${dateIso || 'week'}`,
          dayIndex: computedDayIndex,
          weekday: expectedWeekday !== null ? expectedWeekday : computedDayIndex,
          startDate,
          endDate,
          label: task.label || 'Tâche',
          color: task.color || '#dbeafe',
          icon: task.icon || '📋',
          price: task.price || null,
          readOnly: Boolean(task.readOnly),
          weekly: true,
          taskDateISO: dateIso,
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
