import React, { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/MonthCalendar.css";
import {
  watchPlanningEventsInRange,
  watchWeeklyTasksForContext,
  fetchWeekEventsOnce,
  fetchWeeklyTasksOnce,
  getMonthRange,
  useFirebaseUser,
} from "../firebase";
import { useSettings } from "../context/SettingsContext";
import { getIcon } from "../icons/registry";
import { getTaskColor } from "../constants/colors";

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
  if (typeof value === "number" && value >= 0 && value <= 6) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim().toLowerCase();
    if (/^\d+$/.test(trimmed)) {
      const asNumber = parseInt(trimmed, 10);
      if (!Number.isNaN(asNumber)) {
        if (asNumber >= 0 && asNumber <= 6) {
          return asNumber;
        }
        if (asNumber >= 1 && asNumber <= 7) {
          return (asNumber + 6) % 7;
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(DAY_NAME_TO_INDEX, trimmed)) {
      return DAY_NAME_TO_INDEX[trimmed];
    }
  }
  return null;
};

const parseTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") {
    return null;
  }
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 24 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  if (hours === 24 && minutes !== 0) {
    return null;
  }
  return { hours: hours % 24, minutes };
};

const parseTaskDate = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().length === 10 ? `${value.trim()}T00:00:00` : value.trim();
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    return parseTaskDate(value.toDate());
  }
  return null;
};

export const expandWeeklyTasksToMonthRange = (weeklyTasks, range) => {
  if (!Array.isArray(weeklyTasks) || !range?.from || !range?.to) {
    return [];
  }

  const startDate = new Date(range.from);
  const endDate = new Date(range.to);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  const occurrences = [];

  weeklyTasks.forEach((task) => {
    if (!task || !Array.isArray(task.time_ranges)) {
      return;
    }

    task.time_ranges.forEach((rangeSlot, index) => {
      const slotDay = toDayIndex(rangeSlot?.day ?? rangeSlot?.dayIndex ?? rangeSlot?.weekday);
      const startTime = parseTime(rangeSlot?.start);
      const endTime = parseTime(rangeSlot?.end);
      if (slotDay === null || !startTime || !endTime) {
        return;
      }

      const explicitDate = parseTaskDate(
        rangeSlot?.task_date ??
          rangeSlot?.taskDate ??
          rangeSlot?.task_day_iso ??
          rangeSlot?.taskDayIso ??
          task?.task_date ??
          task?.taskDate ??
          null
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
          id: `${task.id || "task"}:${index}:${taskStart.toISOString()}`,
          taskId: task.id,
          start: taskStart,
          end: taskEnd,
          title: task.title || task.label || "Tâche",
          label: task.label || task.title || "Tâche",
          icon: task.icon || null,
          color: task.color || "#10b981",
          type: task.type || "task",
          status: task.status || "task",
          readOnly: Boolean(task.readOnly),
          weekly: true,
          originalTask: task,
        });
        return;
      }

      const firstOccurrence = new Date(startDate);
      while (
        (firstOccurrence.getDay() + 6) % 7 !== slotDay &&
        firstOccurrence <= endDate
      ) {
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
          id: `${task.id || "task"}:${index}:${taskStart.toISOString()}`,
          taskId: task.id,
          start: taskStart,
          end: taskEnd,
          title: task.title || task.label || "Tâche",
          label: task.label || task.title || "Tâche",
          icon: task.icon || null,
          color: task.color || "#10b981",
          type: task.type || "task",
          status: task.status || "task",
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

const formatIsoDate = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  const year = copy.getFullYear();
  const month = String(copy.getMonth() + 1).padStart(2, "0");
  const day = String(copy.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfWeek = (value) => {
  const base = new Date(value);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  const dayIndex = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - dayIndex);
  base.setHours(0, 0, 0, 0);
  return base;
};

const buildWeekRangesForMonth = (range) => {
  if (!range?.from || !range?.to) {
    return [];
  }
  const firstWeekStart = startOfWeek(range.from);
  if (!firstWeekStart) {
    return [];
  }
  const limit = new Date(range.to);
  limit.setHours(23, 59, 59, 999);
  const segments = [];
  const cursor = new Date(firstWeekStart);
  while (cursor <= limit) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > limit) {
      weekEnd.setTime(limit.getTime());
    }
    segments.push({ start: weekStart, end: weekEnd });
    cursor.setDate(cursor.getDate() + 7);
  }
  return segments;
};

const mergeEventsById = (events) => {
  if (!Array.isArray(events)) {
    return [];
  }
  const map = new Map();
  events.forEach((event) => {
    if (!event) {
      return;
    }
    const startMs = event?.start instanceof Date ? event.start.getTime() : 0;
    const endMs = event?.end instanceof Date ? event.end.getTime() : startMs;
    const key =
      event.id || `${startMs}-${endMs}-${event.client || event.title || "evt"}`;
    if (!map.has(key)) {
      map.set(key, event);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const aTime = a?.start instanceof Date ? a.start.getTime() : 0;
    const bTime = b?.start instanceof Date ? b.start.getTime() : 0;
    return aTime - bTime;
  });
};

function MonthGrid({
  year,
  month,
  onDateSelect,
  onEventClick,
  onCreateEvent,
  context,
  staticEvents = [],
  staticTasks = [],
}) {
  const user = useFirebaseUser();
  const { settings, loading } = useSettings();

  const showWeekendsEnabled = useMemo(() => {
    if (loading || !settings) {
      return true;
    }
    return settings.showWeekends === true;
  }, [loading, settings]);

  const dayNames = useMemo(
    () => ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
    []
  );
  const visibleDayNames = useMemo(
    () => (showWeekendsEnabled ? dayNames : dayNames.slice(0, 5)),
    [dayNames, showWeekendsEnabled]
  );

  const monthColumnCount = showWeekendsEnabled ? 7 : 5;
  const monthGridStyle = useMemo(
    () => ({ "--month-grid-day-count": String(monthColumnCount) }),
    [monthColumnCount]
  );

  const [events, setEvents] = useState([]);
  const [eventsByDay, setEventsByDay] = useState({});
  const [tasksByDay, setTasksByDay] = useState({});

  const hasStaticEvents = Array.isArray(staticEvents) && staticEvents.length > 0;
  const hasStaticTasks = Array.isArray(staticTasks) && staticTasks.length > 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7;

  const cells = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(d);
  }
  while (cells.length < 42) {
    cells.push(null);
  }

  const rows = [];
  for (let i = 0; i < 6; i += 1) {
    rows.push(cells.slice(i * 7, i * 7 + 7));
  }

  const monthRange = useMemo(() => getMonthRange(year, month), [year, month]);

  const contextKey = useMemo(() => {
    if (!context) {
      return "none";
    }
    if (context.type === "team") {
      return `team:${context.teamId || ""}:${context.memberUid || ""}`;
    }
    if (context.type === "team-shared") {
      return `team-shared:${context.teamId || ""}`;
    }
    if (context.type === "personal") {
      return `personal:${context.userId || ""}`;
    }
    if (context.userId) {
      return `personal:${context.userId}`;
    }
    return "none";
  }, [context?.type, context?.teamId, context?.memberUid, context?.userId]);

  const groupItemsByDay = useCallback((items) => {
    const byDay = {};
    items.forEach((entry) => {
      const eventDate = new Date(entry.start);
      if (Number.isNaN(eventDate.getTime())) {
        return;
      }
      const key = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
      if (!byDay[key]) {
        byDay[key] = [];
      }
      byDay[key].push(entry);
    });
    return byDay;
  }, []);

  const viewingOtherTeamMember = Boolean(
    context &&
      context.type === "team" &&
      context.memberUid &&
      user?.uid &&
      context.memberUid !== user.uid
  );

  useEffect(() => {
    if (hasStaticEvents) {
      setEvents(staticEvents);
      setEventsByDay(groupItemsByDay(staticEvents));
      return () => {};
    }

    setEvents([]);
    setEventsByDay({});

    if (!user || !monthRange?.from || !monthRange?.to) {
      return () => {};
    }

    if (!context || (context.type === "team" && !context.memberUid)) {
      return () => {};
    }

    let cancelled = false;
    let stopPrefetch = () => {};

    const runChunkPrefetch = () => {
      const segments = buildWeekRangesForMonth(monthRange);
      if (!segments.length) {
        return () => {};
      }
      let active = true;
      (async () => {
        const collected = [];
        for (const segment of segments) {
          if (!active || cancelled) {
            return;
          }
          const startISO = formatIsoDate(segment.start);
          const endISO = formatIsoDate(segment.end);
          if (!startISO || !endISO) {
            // eslint-disable-next-line no-continue
            continue;
          }
          try {
            const weekly = await fetchWeekEventsOnce(context, startISO, endISO);
            if (!active || cancelled) {
              return;
            }
            if (Array.isArray(weekly)) {
              collected.push(...weekly);
            }
          } catch (error) {
            console.warn("MonthGrid weekly fetch error", error);
          }
        }
        if (!active || cancelled) {
          return;
        }
        const merged = mergeEventsById(collected);
        setEvents(merged);
        setEventsByDay(groupItemsByDay(merged));
      })();
      return () => {
        active = false;
      };
    };

    const shouldPrefetch = context?.type === "team" || viewingOtherTeamMember;
    if (shouldPrefetch) {
      stopPrefetch = runChunkPrefetch();
    }

    if (viewingOtherTeamMember) {
      return () => {
        cancelled = true;
        stopPrefetch();
      };
    }

    const unsubscribe = watchPlanningEventsInRange(
      context,
      monthRange,
      (newEvents) => {
        if (cancelled) {
          return;
        }
        const normalizedEvents = Array.isArray(newEvents) ? newEvents : [];
        setEvents(normalizedEvents);
        setEventsByDay(groupItemsByDay(normalizedEvents));
      },
      (error) => {
        if (cancelled) {
          return;
        }
        console.error("watchPlanningEventsInRange month view error", error);
        setEvents([]);
        setEventsByDay({});
      }
    );

    return () => {
      cancelled = true;
      stopPrefetch();
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [
    user,
    monthRange,
    context,
    contextKey,
    hasStaticEvents,
    staticEvents,
    viewingOtherTeamMember,
    groupItemsByDay,
  ]);

  useEffect(() => {
    if (hasStaticTasks) {
      setTasksByDay(groupItemsByDay(staticTasks));
      return () => {};
    }

    setTasksByDay({});

    if (!user || !context || !monthRange?.from || !monthRange?.to) {
      return () => {};
    }

    if (context.type === "team" && !context.memberUid) {
      return () => {};
    }

    if (viewingOtherTeamMember) {
      let cancelled = false;
      const loadTasks = async () => {
        try {
          const rawTasks = await fetchWeeklyTasksOnce(context);
          if (cancelled) {
            return;
          }
          const occurrences = expandWeeklyTasksToMonthRange(rawTasks, monthRange);
          setTasksByDay(groupItemsByDay(occurrences));
        } catch (error) {
          console.warn("MonthGrid tasks fallback error", error);
          if (!cancelled) {
            setTasksByDay({});
          }
        }
      };
      loadTasks();
      return () => {
        cancelled = true;
      };
    }

    let active = true;
    const unsubscribe = watchWeeklyTasksForContext(
      context,
      (weeklyTasksList) => {
        if (!active) {
          return;
        }
        const occurrences = expandWeeklyTasksToMonthRange(
          Array.isArray(weeklyTasksList) ? weeklyTasksList : [],
          monthRange
        );
        setTasksByDay(groupItemsByDay(occurrences));
      },
      (error) => {
        if (!active) {
          return;
        }
        console.error("watchWeeklyTasksForContext month view error", error);
        setTasksByDay({});
      }
    );

    return () => {
      active = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [
    user,
    context,
    contextKey,
    monthRange,
    hasStaticTasks,
    staticTasks,
    viewingOtherTeamMember,
    groupItemsByDay,
  ]);

  const handleSelect = (value) => {
    if (!user) {
      console.warn("Utilisateur non connecté, sélection bloquée");
      return;
    }
    if (!value) {
      return;
    }
    const selectedDate = new Date(year, month, value);
    const wantsEvent = window.confirm(
      "Créer un événement ?\nAnnuler pour accéder à la semaine"
    );
    if (wantsEvent) {
      onCreateEvent && onCreateEvent(selectedDate);
    } else if (onDateSelect) {
      onDateSelect(selectedDate);
    }
  };

  const getDayItems = (value) => {
    if (!value) {
      return { events: [], tasks: [], total: 0 };
    }
    const key = `${year}-${month}-${value}`;
    const dayEvents = eventsByDay[key] || [];
    const dayTasks = tasksByDay[key] || [];
    return {
      events: dayEvents,
      tasks: dayTasks,
      total: dayEvents.length + dayTasks.length,
    };
  };

  const renderDayItems = (items, maxVisible = 3) => {
    const { events: dayEvents, tasks: dayTasks, total } = items;
    const allItems = [...dayEvents, ...dayTasks].slice(0, maxVisible);
    const remaining = Math.max(0, total - maxVisible);

    return (
      <>
        {allItems.map((item) => {
          const isTask = (item.type || "").toLowerCase() === "task" || Boolean(item.icon);
          const status = (item.status || item.type || "").toLowerCase();
          const statusClass = !isTask && ["paid", "pending", "unpaid"].includes(status)
            ? `status-${status}`
            : "";
          const colors = getTaskColor(item.color || "");
          const style = isTask
            ? {
                "--item-color": colors.backgroundColor,
                backgroundColor: colors.backgroundColor,
                color: colors.color,
                borderColor: colors.borderColor,
              }
            : !statusClass && item.color
            ? { "--item-color": item.color }
            : undefined;
          const label = item.client || item.title;
          const IconComponent = isTask ? getIcon(item.icon ?? undefined) : null;
          return (
            <div
              key={item.id}
              className={`month-item ${isTask ? "month-task" : ""} ${statusClass}`.trim()}
              style={style}
              onClick={(evt) => {
                evt.stopPropagation();
                onEventClick && onEventClick(item);
              }}
              title={label}
            >
              {isTask && (
                <span className="month-item-icon" aria-hidden="true">
                  {IconComponent ? (
                    <IconComponent className="h-[14px] w-[14px]" strokeWidth={2} />
                  ) : (
                    item.icon || "•"
                  )}
                </span>
              )}
              <span className="month-item-title">
                {label?.length > 12 ? `${label.substring(0, 12)}...` : label}
              </span>
            </div>
          );
        })}
        {remaining > 0 && <div className="month-item-more">+{remaining}</div>}
      </>
    );
  };

  return (
    <div className="month-calendar" style={monthGridStyle}>
      <div className="month-day-header">
        {visibleDayNames.map((dayLabel) => (
          <div key={dayLabel} className="calendar-header-cell">
            {dayLabel}
          </div>
        ))}
      </div>
      <div className="month-grid border rounded-md overflow-hidden">
        {rows.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} className="calendar-row">
            {week.map((value, dayIndex) => {
              if (!showWeekendsEnabled && dayIndex >= 5) {
                return null;
              }
              return value ? (
                <div
                  key={`day-${weekIndex}-${dayIndex}`}
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
                <div key={`empty-${weekIndex}-${dayIndex}`} className="calendar-cell empty" />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MonthGrid;


