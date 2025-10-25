import React, { useState, useEffect, useMemo } from 'react';
import '../styles/MonthCalendar.css';
import {
  watchPlanningEventsInRange,
  watchWeeklyTasksForContext,
  getMonthRange,
  useFirebaseUser,
} from '../firebase';
import { useSettings } from '../context/SettingsContext';

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

    if (Object.prototype.hasOwnProperty.call(DAY_NAME_TO_INDEX, trimmed)) {
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

const expandWeeklyTasksToMonthRange = (weeklyTasks, range) => {
  if (!Array.isArray(weeklyTasks)) {
    return [];
  }
  if (!range?.from || !range?.to) {
    return [];
  }

  const startDate = new Date(range.from);
  const endDate = new Date(range.to);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  if (startDate > endDate) {
    return [];
  }

  const occurrences = [];

  weeklyTasks.forEach((task) => {
    if (!task || !Array.isArray(task.time_ranges)) {
      return;
    }

    task.time_ranges.forEach((slot, index) => {
      const dayValue = slot?.day ?? slot?.dayIndex ?? slot?.weekday;
      const dayIndex = toDayIndex(dayValue);
      const startTime = parseTime(slot?.start);
      const endTime = parseTime(slot?.end);

      if (dayIndex === null || !startTime || !endTime) {
        return;
      }

      const taskWeekday = toDayIndex(task.weekday ?? task.week_day ?? task.weekDay);
      if (taskWeekday !== null && taskWeekday !== dayIndex) {
        return;
      }

      const explicitDate = parseTaskDate(
        slot?.task_date ?? slot?.taskDate ?? slot?.task_day_iso ?? slot?.taskDayIso ?? null,
      );

      if (explicitDate) {
        if (explicitDate < startDate || explicitDate > endDate) {
          return;
        }

        const taskStart = new Date(explicitDate);
        taskStart.setHours(startTime.hours, startTime.minutes, 0, 0);

        const taskEnd = new Date(explicitDate);
        taskEnd.setHours(endTime.hours, endTime.minutes, 0, 0);

        if (taskEnd <= taskStart) {
          return;
        }

        occurrences.push({
          id: `${task.id || 'task'}:${index}:${taskStart.toISOString()}`,
          taskId: task.id,
          start: taskStart,
          end: taskEnd,
          title: task.title || task.label || 'Tâche',
          label: task.label || task.title || 'Tâche',
          icon: task.icon || '📋',
          color: task.color || '#10b981',
          type: task.type || 'task',
          status: task.status || 'task',
          readOnly: Boolean(task.readOnly),
          weekly: true,
          originalTask: task,
        });
        return;
      }

      const firstOccurrence = new Date(startDate);
      while ((firstOccurrence.getDay() + 6) % 7 !== dayIndex && firstOccurrence <= endDate) {
        firstOccurrence.setDate(firstOccurrence.getDate() + 1);
      }

      if (firstOccurrence > endDate) {
        return;
      }

      for (
        let current = new Date(firstOccurrence);
        current <= endDate;
        current.setDate(current.getDate() + 7)
      ) {
        const taskStart = new Date(current);
        taskStart.setHours(startTime.hours, startTime.minutes, 0, 0);

        const taskEnd = new Date(current);
        taskEnd.setHours(endTime.hours, endTime.minutes, 0, 0);

        if (taskEnd <= taskStart) {
          continue;
        }

        occurrences.push({
          id: `${task.id || 'task'}:${index}:${taskStart.toISOString()}`,
          taskId: task.id,
          start: taskStart,
          end: taskEnd,
          title: task.title || task.label || 'Tâche',
          label: task.label || task.title || 'Tâche',
          icon: task.icon || '📋',
          color: task.color || '#10b981',
          type: task.type || 'task',
          status: task.status || 'task',
          readOnly: Boolean(task.readOnly),
          weekly: true,
          originalTask: task,
        });
      }
    });
  });

  occurrences.sort((a, b) => a.start - b.start);

  return occurrences;
};
function MonthGrid({ year, month, onDateSelect, onEventClick, onCreateEvent, context }) {
  const user = useFirebaseUser();
  const { settings, loading } = useSettings();
  const showWeekendsEnabled = useMemo(() => {
    if (loading || !settings) {
      return true;
    }
    return settings.showWeekends === true;
  }, [loading, settings]);
  const dayNames = useMemo(
    () => ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
    []
  );
  const visibleDayNames = useMemo(
    () => (showWeekendsEnabled ? dayNames : dayNames.slice(0, 5)),
    [dayNames, showWeekendsEnabled]
  );
  const monthColumnCount = showWeekendsEnabled ? 7 : 5;
  const monthGridStyle = useMemo(
    () => ({
      '--month-grid-day-count': String(monthColumnCount),
    }),
    [monthColumnCount]
  );
  const [events, setEvents] = useState([]);
  const [eventsByDay, setEventsByDay] = useState({});
  const [tasksByDay, setTasksByDay] = useState({});

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7; // Monday = 0
  
  const cells = [];
  for (let i = 0; i < offset; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  while (cells.length < 42) {
    cells.push(null);
  }

  const rows = [];
  for (let i = 0; i < 6; i++) {
    rows.push(cells.slice(i * 7, i * 7 + 7));
  }

  const monthRange = useMemo(() => getMonthRange(year, month), [year, month]);

  // Watch events - seulement si user connecté
  const contextKey = useMemo(() => {
    if (!context) {
      return 'none';
    }
    if (context.type === 'team') {
      return `team:${context.teamId || ''}:${context.memberUid || ''}`;
    }
    return `personal:${context.userId || ''}`;
  }, [context?.type, context?.teamId, context?.memberUid, context?.userId]);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setEventsByDay({});
      return;
    }

    if (!monthRange?.from || !monthRange?.to) {
      setEvents([]);
      setEventsByDay({});
      return;
    }

    if (context && context.type === 'team' && !context.memberUid) {
      setEvents([]);
      setEventsByDay({});
      return;
    }

    const unsubscribe = watchPlanningEventsInRange(context, monthRange, (newEvents) => {
      setEvents(newEvents);
      
      // Organiser les événements par jour
      const byDay = {};
      newEvents.forEach(event => {
        const eventDate = new Date(event.start);
        const dayKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
        
        if (!byDay[dayKey]) {
          byDay[dayKey] = [];
        }
        byDay[dayKey].push(event);
      });
      
      setEventsByDay(byDay);
    });

    return unsubscribe;
  }, [user, monthRange, contextKey, context]);

  // Watch tasks - seulement si user connecté
  useEffect(() => {
    if (!user || !context) {
      setTasksByDay({});
      return () => {};
    }

    if (!monthRange?.from || !monthRange?.to) {
      setTasksByDay({});
      return () => {};
    }

    if (context.type === 'team' && !context.memberUid) {
      setTasksByDay({});
      return () => {};
    }

    let active = true;

    const unsubscribe = watchWeeklyTasksForContext(
      context,
      (weeklyTasksList) => {
        if (!active) {
          return;
        }

        const occurrences = expandWeeklyTasksToMonthRange(weeklyTasksList, monthRange);
        const byDay = {};
        occurrences.forEach((taskItem) => {
          const taskDate = new Date(taskItem.start);
          if (Number.isNaN(taskDate.getTime())) {
            return;
          }
          const dayKey = `${taskDate.getFullYear()}-${taskDate.getMonth()}-${taskDate.getDate()}`;

          if (!byDay[dayKey]) {
            byDay[dayKey] = [];
          }
          byDay[dayKey].push(taskItem);
        });

        setTasksByDay(byDay);
      },
      (error) => {
        if (!active) {
          return;
        }
        console.error('watchWeeklyTasksForContext month view error', error);
        setTasksByDay({});
      }
    );

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user, monthRange, contextKey, context]);

  const handleSelect = (value) => {
    if (!user) {
      console.warn('Utilisateur non connecté, sélection bloquée');
      return;
    }

    if (value) {
      const selectedDate = new Date(year, month, value);
      const wantsEvent = window.confirm('Créer un événement ?\nAnnuler pour accéder à la semaine');
      if (wantsEvent) {
        onCreateEvent && onCreateEvent(selectedDate);
      } else if (onDateSelect) {
        onDateSelect(selectedDate);
      }
    }
  };

  const getDayItems = (value) => {
    if (!value) return { events: [], tasks: [], total: 0 };
    
    const dayKey = `${year}-${month}-${value}`;
    const dayEvents = eventsByDay[dayKey] || [];
    const dayTasks = tasksByDay[dayKey] || [];
    
    return {
      events: dayEvents,
      tasks: dayTasks,
      total: dayEvents.length + dayTasks.length
    };
  };

  const renderDayItems = (items, maxVisible = 3) => {
    const { events, tasks, total } = items;
    const allItems = [...events, ...tasks].slice(0, maxVisible);
    const remaining = Math.max(0, total - maxVisible);

    return (
      <>
        {allItems.map((item) => {
          const isTask = !!item.icon;
          const type = item.status || item.type;
          const statusClass = !isTask && ['paid', 'unpaid', 'pending'].includes(type)
            ? `status-${type}`
            : '';
          const style = isTask
            ? { '--item-color': item.color || '#10b981' }
            : !statusClass && item.color
            ? { '--item-color': item.color }
            : undefined;
          const label = item.client || item.title;
          return (
            <div
              key={item.id}
              className={`month-item ${isTask ? 'month-task' : ''} ${statusClass}`.trim()}
              style={style}
              onClick={(evt) => {
                evt.stopPropagation();
                onEventClick && onEventClick(item);
              }}
              title={label}
            >
              {isTask && <span className="month-item-icon">{item.icon}</span>}
              <span className="month-item-title">
                {label?.length > 12 ? `${label.substring(0, 12)}...` : label}
              </span>
            </div>
          );
        })}
        {remaining > 0 && (
          <div className="month-item-more">+{remaining}</div>
        )}
      </>
    );
  };

  const isSpanningEvent = (event, currentDay) => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const dayStart = new Date(year, month, currentDay);
    const dayEnd = new Date(year, month, currentDay + 1);
    
    return eventStart < dayStart || eventEnd > dayEnd;
  };

  return (
      <div className="month-calendar" style={monthGridStyle}>
      <div className="month-day-header">
        {visibleDayNames.map((day) => (
          <div key={day} className="calendar-header-cell">
            {day}
          </div>
        ))}
      </div>
      <div className="month-grid border rounded-md overflow-hidden">
        {rows.map((week, wi) => (
          <div key={wi} className="calendar-row">
            {week.map((value, di) => {
              if (!showWeekendsEnabled && di >= 5) {
                return null;
              }
              return value ? (
                <div
                  key={di}
                  className="calendar-cell"
                  onClick={() => handleSelect(value)}
                >
                  <div className="calendar-cell-header">
                    <span className="calendar-cell-day">{value}</span>
                  </div>

                  <div className="calendar-cell-content">
                    {renderDayItems(getDayItems(value))}
                  </div>
                </div>
              ) : (
                <div key={di} className="calendar-cell empty" />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MonthGrid;
