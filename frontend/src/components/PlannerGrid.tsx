import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import '../styles/WeeklyGrid.css';
import { useFirebaseUser } from '../firebase';
import { calculateHeight, calculateTopPosition } from '../utils/time';
import { getTaskColor } from '../constants/colors';
import { getIcon } from '../icons/registry';
import { useSettings } from '../context/SettingsContext';
import PriorityNumberBadge from './PriorityNumberBadge';
import { getPriorityDisplay } from '../utils/priorityDisplay';
import {
  selectDisplayModel,
  DisplayEvent,
  TaskOccurrence,
  DateRange,
  PlannerEventInput,
  AttachedTaskBadge,
} from '../selectors/planningSelectors';
import EventCard from './EventCard';
import {
  TASK_STATUS_DISPLAY,
  TASK_STATUS_INDICATOR_STYLES,
  resolveEffectiveTaskStatus,
  type TaskStatusKey,
} from '../constants/taskStatusDisplay';
import { surface, radius } from '../ui/designTokens';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SLOT_HEIGHT = 64;
const DEFAULT_DAY_START_HOUR = 7;
const DEFAULT_DAY_END_HOUR = 20;
const MOBILE_BREAKPOINT = 768;

type PositionUnit = 'percentage' | 'minutes';

const floorDateToHour = (value: Date): Date => {
  const date = new Date(value);
  date.setMinutes(0, 0, 0);
  return date;
};

const ceilDateToHour = (value: Date): Date => {
  const date = new Date(value);
  if (
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  ) {
    return date;
  }
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
};

const rangesOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean => {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
};

const resolveDayEventConflicts = (eventsForDay: DisplayEvent[]): DisplayEvent[] => {
  if (eventsForDay.length <= 1) {
    return eventsForDay;
  }

  const prioritized = [...eventsForDay].sort((a, b) => {
    const aScore = typeof a.displayPriority === 'number' ? a.displayPriority : -Infinity;
    const bScore = typeof b.displayPriority === 'number' ? b.displayPriority : -Infinity;

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    const startDiff = b.startDate.getTime() - a.startDate.getTime();
    if (startDiff !== 0) {
      return startDiff;
    }

    return b.endDate.getTime() - a.endDate.getTime();
  });

  const resolved: DisplayEvent[] = [];

  prioritized.forEach((event) => {
    const overlapsExisting = resolved.some((existing) =>
      rangesOverlap(existing.startDate, existing.endDate, event.startDate, event.endDate)
    );

    if (!overlapsExisting) {
      resolved.push(event);
    }
  });

  return resolved.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
};

interface PlannerGridProps {
  events?: PlannerEventInput[];
  tasks?: unknown[];
  weekStart: Date | string | { toDate: () => Date };
  onSlotSelect?: (start: Date) => void;
  onEventClick?: (event: DisplayEvent) => void;
  onTaskClick?: (task: TaskOccurrence) => void;
  isReadOnlyMode?: boolean;
}

interface EventLayout {
  event: DisplayEvent;
  top: number;
  height: number;
  columnIndex: number;
  columnCount: number;
}

interface TaskBlockLayout {
  task: TaskOccurrence;
  top: number;
  height: number;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

interface DaySlot {
  key: string;
  dayIndex: number;
  startDate: Date;
  endDate: Date;
  event: DisplayEvent | null;
  eventTaskBadges: AttachedTaskBadge[];
  tasks: TaskOccurrence[];
  status?: string;
  done?: boolean;
}

const formatHourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

const GridLayer = React.memo(({ hours }: { hours: string[] }) => (
  <div className="grid-layer">
    <div className="days-grid" />
  </div>
));

interface InteractiveLayerProps {
  hours: string[];
  days: { name: string; date: Date }[];
  eventLayouts: EventLayout[][];
  taskLayouts: TaskBlockLayout[][];
  onCellClick?: (date: Date, hour: string) => void;
  onAddEvent?: (date: Date, hour: string) => void;
  onEventClick?: (event: DisplayEvent) => void;
  onTaskClick?: (task: TaskOccurrence) => void;
  isReadOnlyMode?: boolean;
  positionUnit: PositionUnit;
  minuteHeight: number;
}

const formatPositionValue = (value: number, unit: PositionUnit, minuteHeight: number): string => {
  if (unit === 'minutes') {
    const safeMinuteHeight = Number.isFinite(minuteHeight) && minuteHeight > 0 ? minuteHeight : SLOT_HEIGHT / 60;
    const computedPx = Number.isFinite(value) ? Math.max(0, value) * safeMinuteHeight : 0;
    return `${Number(computedPx.toFixed(4))}px`;
  }
  return `${value}%`;
};

const InteractiveLayer = React.memo(function InteractiveLayer({
  hours,
  days,
  eventLayouts,
  taskLayouts,
  onCellClick,
  onAddEvent,
  onEventClick,
  onTaskClick,
  isReadOnlyMode,
  positionUnit,
  minuteHeight,
}: InteractiveLayerProps) {
  return (
    <div className="interactive-layer">
      {days.map((day, dayIndex) => (
        <div
          key={dayIndex}
          className="day-column dark:border-slate-700"
          style={{ gridColumn: dayIndex + 1, gridRow: '1 / -1' }}
        >
          {!isReadOnlyMode && (
            <button
              type="button"
              className="add-event-btn"
              onClick={() => onAddEvent?.(day.date, hours[0] ?? '09:00')}
              title="Ajouter un événement"
              data-testid={`add-event-day-${dayIndex}`}
            >
              +
            </button>
          )}

          {hours.map((time, hourIndex) => (
            <button
              key={time}
              type="button"
              className="time-slot-cell dark:border-slate-700 dark:hover:bg-slate-700/40 dark:focus:bg-slate-700/50"
              style={{ gridRow: hourIndex + 1 }}
              onClick={() => !isReadOnlyMode && onCellClick?.(day.date, time)}
              disabled={isReadOnlyMode}
              data-testid={`time-slot-${dayIndex}-${hourIndex}`}
            />
          ))}
        </div>
      ))}

      {eventLayouts.map((dayEvents, dayIndex) => (
        <div key={`events-${dayIndex}`} className="events-container" style={{ gridColumn: dayIndex + 1 }}>
          {dayEvents.map(({ event, top, height, columnIndex, columnCount }) => {
            if (height <= 0) return null;
            const left = (columnIndex * 100) / columnCount;
            const width = 100 / columnCount;
            const topValue = formatPositionValue(top, positionUnit, minuteHeight);
            const heightValue = formatPositionValue(height, positionUnit, minuteHeight);

            return (
              <EventCard
                key={event.id}
                event={event}
                onClick={onEventClick}
                style={{
                  top: topValue,
                  height: heightValue,
                  left: `${left}%`,
                  width: `${width}%`,
                }}
              />
            );
          })}
        </div>
      ))}

      {taskLayouts.map((dayTasks, dayIndex) => (
        <div key={`tasks-${dayIndex}`} className="tasks-container" style={{ gridColumn: dayIndex + 1 }}>
          {dayTasks.map(({ task, top, height, backgroundColor, borderColor, textColor }) => {
            if (height <= 0) return null;

            const IconComponent = getIcon(task.icon ?? undefined);
            const isInteractive =
              !isReadOnlyMode && !task.readOnly && typeof onTaskClick === 'function';

            const topValue = formatPositionValue(top, positionUnit, minuteHeight);
            const heightValue = formatPositionValue(height, positionUnit, minuteHeight);

            const startTimeLabel = task.startDate.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const endTimeLabel = task.endDate.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const formattedPrice =
              typeof task.price === 'number'
                ? `${task.price.toLocaleString('fr-FR', {
                    minimumFractionDigits: task.price % 1 === 0 ? 0 : 2,
                    maximumFractionDigits: 2,
                  })} €`
                : typeof task.price === 'string'
                ? task.price.trim()
                : '';

            const titleParts = [task.label];
            if (startTimeLabel && endTimeLabel) {
              titleParts.push(`${startTimeLabel} - ${endTimeLabel}`);
            }
            if (formattedPrice) {
              titleParts.push(formattedPrice);
            }
            const tooltipTitle = titleParts.filter(Boolean).join('\n');

            const handleTaskClick = () => {
              if (!isInteractive || !onTaskClick) return;
              onTaskClick(task);
            };

            const handleTaskKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (!isInteractive || !onTaskClick) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onTaskClick(task);
              }
            };

            const taskCardClassName = `task-standalone transition-transform transition-shadow duration-150 ease-out ${
              isInteractive
                ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-100/70 dark:focus-visible:ring-offset-slate-900 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99]'
                : ''
            }`;

            return (
              <div
                key={task.occurrenceId}
                className={taskCardClassName}
                style={{
                  top: topValue,
                  height: heightValue,
                  left: '2px',
                  right: '2px',
                  backgroundColor,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'auto',
                }}
                data-testid={`task-standalone-${task.occurrenceId}`}
                role={isInteractive ? 'button' : 'group'}
                tabIndex={isInteractive ? 0 : undefined}
                onClick={handleTaskClick}
                onKeyDown={handleTaskKeyDown}
                aria-label={`Tâche hebdomadaire : ${task.label}`}
                title={tooltipTitle}
              >
                <div className="flex w-full items-center gap-2 px-2 py-1 text-xs sm:text-sm">
                  <IconComponent className="h-4 w-4 flex-shrink-0" strokeWidth={2} aria-hidden="true" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium leading-tight">{task.label}</span>
                    <div className="flex items-center gap-2 text-[11px] font-normal leading-tight opacity-90">
                      <span>
                        {startTimeLabel} - {endTimeLabel}
                      </span>
                      {formattedPrice ? <span>{formattedPrice}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

function ensureDate(value: Date | string | { toDate: () => Date }): Date {
  if (value instanceof Date) return new Date(value);
  if (typeof value === 'string') return new Date(value);
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date(value as unknown as string);
}

const createDateRange = (weekStart: Date): DateRange => {
  const from = new Date(weekStart);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

const PlannerGrid: React.FC<PlannerGridProps> = ({
  events = [],
  tasks = [],
  weekStart,
  onSlotSelect,
  onEventClick,
  onTaskClick,
  isReadOnlyMode = false,
}) => {
  const user = useFirebaseUser();
  const settingsContext = useSettings();
  const { showTaskStatusBadges = true, showTaskPriorityBadges = true } = settingsContext || {};
  const settings = settingsContext?.settings;
  const loading = settingsContext?.loading ?? false;
  const showPriorityBadges = showTaskPriorityBadges;
  const showStatusBadges = showTaskStatusBadges;
  const [viewFilter, setViewFilter] = useState<'today' | 'week'>('week');
  const allowMinutes = settings?.enableMinutes === true;
  const showWeekendsEnabled = useMemo(() => {
    if (loading || !settings) {
      return true;
    }
    return settings.showWeekends === true;
  }, [loading, settings]);

  const { startHour, endHour } = useMemo(() => {
    if (loading || !settings) {
      return { startHour: DEFAULT_DAY_START_HOUR, endHour: DEFAULT_DAY_END_HOUR };
    }

    if (settings.showFullDay === true) {
      return { startHour: 0, endHour: 24 };
    }

    const rawStart =
      typeof settings.dayStartHour === 'number' ? settings.dayStartHour : DEFAULT_DAY_START_HOUR;
    const rawEnd =
      typeof settings.dayEndHour === 'number' ? settings.dayEndHour : DEFAULT_DAY_END_HOUR;

    let normalizedStart = Math.max(0, Math.min(23, Math.trunc(rawStart)));
    let normalizedEnd = Math.max(1, Math.min(24, Math.trunc(rawEnd)));

    if (normalizedEnd <= normalizedStart) {
      normalizedEnd = Math.min(24, normalizedStart + 1);
      normalizedStart = Math.max(0, Math.min(normalizedStart, normalizedEnd - 1));
    }

    return { startHour: normalizedStart, endHour: normalizedEnd };
  }, [loading, settings]);

  const visibleRange = useMemo(() => ({ startHour, endHour }), [startHour, endHour]);

  const gridColumnCount = showWeekendsEnabled ? 7 : 5;
  const weeklyGridStyle = useMemo(
    () => ({
      '--weekly-grid-day-count': String(gridColumnCount),
    }) as React.CSSProperties,
    [gridColumnCount]
  );
  const normalizedWeekStart = useMemo(() => ensureDate(weekStart), [weekStart]);
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
    };

    setIsMobileLayout(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const gridViewportHeight = useMemo(
    () => (isMobileLayout ? 'calc(100vh - 220px)' : 'calc(100vh - 320px)'),
    [isMobileLayout]
  );

  const gridScrollStyle = useMemo(
    () => ({
      height: gridViewportHeight,
      maxHeight: gridViewportHeight,
    }),
    [gridViewportHeight]
  );

  const hours = useMemo(() => {
    const total = Math.max(0, endHour - startHour);
    return Array.from({ length: total }, (_, i) => formatHourLabel(startHour + i));
  }, [startHour, endHour]);

  const hourSlotLabels = useMemo(() => {
    if (hours.length === 0) {
      return [formatHourLabel(startHour)];
    }

    return hours;
  }, [hours, startHour]);
  const finalHourLabel = useMemo(() => formatHourLabel(endHour), [endHour]);
  const positionUnit: PositionUnit = allowMinutes || isMobileLayout ? 'minutes' : 'percentage';
  const minuteHeight = SLOT_HEIGHT / 60;
  const rowCount = Math.max(hours.length, 1);

  const days = useMemo(() => {
    const base = new Date(normalizedWeekStart);
    const fullWeek = DAY_NAMES.map((name, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index);
      return { name, date };
    });
    if (showWeekendsEnabled) {
      return fullWeek;
    }
    return fullWeek.filter((day) => {
      const isoDay = day.date.getDay() === 0 ? 7 : day.date.getDay();
      return isoDay >= 1 && isoDay <= 5;
    });
  }, [normalizedWeekStart, showWeekendsEnabled]);

  const dateRange = useMemo(() => createDateRange(normalizedWeekStart), [normalizedWeekStart]);

  const { displayEvents, displayTaskGroups } = useMemo(
    () => selectDisplayModel({ dateRange, events, tasks }),
    [dateRange, events, tasks]
  );

  const mergedDaySlots = useMemo(() => {
    const slotMaps: Map<string, DaySlot>[] = Array.from({ length: 7 }, () => new Map());

    const createSlotKey = (dayIndex: number, start: Date, end: Date) =>
      `${dayIndex}-${start.getTime()}-${end.getTime()}`;

    const resolvePriority = (event: DisplayEvent | null | undefined) => {
      if (!event) {
        return -Infinity;
      }
      if (typeof event.displayPriority === 'number' && Number.isFinite(event.displayPriority)) {
        return event.displayPriority;
      }
      return event.startDate.getTime();
    };

    displayEvents.forEach((event) => {
      if (event.dayIndex < 0 || event.dayIndex > 6) {
        return;
      }

      const startDate = new Date(event.startDate);
      const endDate = new Date(event.endDate);
      const key = createSlotKey(event.dayIndex, startDate, endDate);
      const dayMap = slotMaps[event.dayIndex];
      const existing = dayMap.get(key);

      if (!existing) {
        dayMap.set(key, {
          key,
          dayIndex: event.dayIndex,
          startDate,
          endDate,
          event,
          eventTaskBadges: Array.isArray(event.attachedTaskBadges)
            ? [...event.attachedTaskBadges]
            : [],
          tasks: [],
        });
        return;
      }

      const currentPriority = resolvePriority(existing.event);
      const nextPriority = resolvePriority(event);

      if (nextPriority >= currentPriority) {
        existing.event = event;
        existing.eventTaskBadges = Array.isArray(event.attachedTaskBadges)
          ? [...event.attachedTaskBadges]
          : [];
      }
    });

    displayTaskGroups.forEach((group) => {
      if (group.dayIndex < 0 || group.dayIndex > 6) {
        return;
      }

      const startDate = new Date(group.startDate);
      const endDate = new Date(group.endDate);
      const key = createSlotKey(group.dayIndex, startDate, endDate);
      const dayMap = slotMaps[group.dayIndex];
      const slot = dayMap.get(key);

      if (!slot) {
        dayMap.set(key, {
          key,
          dayIndex: group.dayIndex,
          startDate,
          endDate,
          event: null,
          eventTaskBadges: [],
          tasks: [...group.tasks],
        });
        return;
      }

      group.tasks.forEach((task) => {
        if (!slot.tasks.some((existingTask) => existingTask.occurrenceId === task.occurrenceId)) {
          slot.tasks.push(task);
        }
      });
    });

    return slotMaps.map((dayMap) => {
      const slots = Array.from(dayMap.values());
      if (slots.length === 0) {
        return [];
      }

      return slots.sort((a, b) => {
        const diff = a.startDate.getTime() - b.startDate.getTime();
        if (diff !== 0) {
          return diff;
        }
        return a.endDate.getTime() - b.endDate.getTime();
      });
    });
  }, [displayEvents, displayTaskGroups]);

  const eventLayouts = useMemo(() => {
    const perDay: DisplayEvent[][] = Array.from({ length: 7 }, () => []);

    displayEvents.forEach((event) => {
      if (event.dayIndex < 0 || event.dayIndex > 6) return;
      perDay[event.dayIndex].push(event);
    });

    return perDay.map((dayEvents) => {
      const resolvedEvents = resolveDayEventConflicts(dayEvents);
      const columnEndTimes: number[] = [];
      const layouts: EventLayout[] = [];

      resolvedEvents.forEach((event) => {
        const effectiveStart = allowMinutes ? event.startDate : floorDateToHour(event.startDate);
        const effectiveEnd = allowMinutes ? event.endDate : ceilDateToHour(event.endDate);

        const startMinutes =
          effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
        const endMinutes = effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();
        let columnIndex = 0;
        while (columnEndTimes[columnIndex] !== undefined && columnEndTimes[columnIndex] > startMinutes) {
          columnIndex += 1;
        }
        columnEndTimes[columnIndex] = endMinutes;

        const top = calculateTopPosition(effectiveStart, true, positionUnit, visibleRange);
        const height = calculateHeight(effectiveStart, effectiveEnd, true, positionUnit, visibleRange);

        layouts.push({
          event,
          top,
          height,
          columnIndex,
          columnCount: 1,
        });
      });

      const columnCount = layouts.reduce((max, layout) => Math.max(max, layout.columnIndex + 1), 1);
      return layouts.map((layout) => ({ ...layout, columnCount }));
    });
  }, [allowMinutes, displayEvents, positionUnit, visibleRange]);

  const visibleEventLayouts = useMemo(
    () => (showWeekendsEnabled ? eventLayouts : eventLayouts.filter((_, index) => index < 5)),
    [eventLayouts, showWeekendsEnabled]
  );

  const taskLayouts = useMemo(() => {
    const perDay: TaskBlockLayout[][] = Array.from({ length: 7 }, () => []);

    displayTaskGroups
      .filter((group) => !group.attachedToEvent)
      .forEach((group) => {
        if (group.dayIndex < 0 || group.dayIndex > 6) return;

        group.tasks.forEach((task) => {
          if (task.dayIndex < 0 || task.dayIndex > 6) {
            return;
          }
          if (typeof task.weekday === 'number' && task.weekday !== task.dayIndex) {
            return;
          }
          const effectiveStart = allowMinutes ? task.startDate : floorDateToHour(task.startDate);
          const effectiveEnd = allowMinutes ? task.endDate : ceilDateToHour(task.endDate);
          const top = calculateTopPosition(effectiveStart, true, positionUnit, visibleRange);
          const height = calculateHeight(effectiveStart, effectiveEnd, true, positionUnit, visibleRange);
          if (height <= 0) {
            return;
          }
          const colors = getTaskColor(task.color || '');

          perDay[task.dayIndex].push({
            task,
            top,
            height,
            backgroundColor: colors.backgroundColor,
            borderColor: colors.borderColor,
            textColor: colors.color,
          });
        });
      });

    perDay.forEach((dayTasks) => {
      dayTasks.sort((a, b) => a.top - b.top || a.task.startDate.getTime() - b.task.startDate.getTime());
    });

    return perDay;
  }, [allowMinutes, displayTaskGroups, positionUnit, visibleRange]);

  const visibleTaskLayouts = useMemo(
    () => (showWeekendsEnabled ? taskLayouts : taskLayouts.filter((_, index) => index < 5)),
    [showWeekendsEnabled, taskLayouts]
  );

  const onCellClick = useCallback(
    (date: Date, timeString: string) => {
      if (!user) return;
      const [hoursValue, minutesValue] = timeString.split(':').map(Number);
      const start = new Date(date);
      start.setHours(hoursValue, minutesValue, 0, 0);
      onSlotSelect?.(start);
    },
    [onSlotSelect, user]
  );

  const onAddEvent = useCallback(
    (date: Date, timeString: string) => {
      if (!user) return;
      const [hoursValue, minutesValue] = timeString.split(':').map(Number);
      const start = new Date(date);
      start.setHours(hoursValue, minutesValue, 0, 0);
      onSlotSelect?.(start);
    },
    [onSlotSelect, user]
  );

  const containerHeight = useMemo(() => rowCount * SLOT_HEIGHT, [rowCount]);
  const gridBodyStyle = useMemo(
    () =>
      ({
        height: containerHeight,
        '--weekly-grid-slot-height': `${SLOT_HEIGHT}px`,
        '--weekly-grid-row-h': `${SLOT_HEIGHT}px`,
        '--weekly-grid-minute-height': `${minuteHeight}px`,
        '--weekly-grid-row-count': String(rowCount),
      }) as React.CSSProperties,
    [containerHeight, minuteHeight, rowCount]
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  if (!user) {
    return <div>Chargement...</div>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mobileDaysToShow = viewFilter === 'today'
    ? days.filter(day => {
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0);
        return dayDate.getTime() === today.getTime();
      })
    : days;

  return (
    <div ref={wrapperRef}>
      {/* Toggle Mobile - Visible uniquement sur mobile */}
      <div className="flex md:hidden gap-2 mb-4">
        <button
          type="button"
          onClick={() => setViewFilter('today')}
          className={`min-h-[44px] px-3 rounded-md text-sm font-medium flex-1 ${
            viewFilter === 'today'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-600 dark:border-slate-600 text-gray-900 dark:text-slate-100'
          }`}
        >
          Aujourd'hui
        </button>
        <button
          type="button"
          onClick={() => setViewFilter('week')}
          className={`min-h-[44px] px-3 rounded-md text-sm font-medium flex-1 ${
            viewFilter === 'week'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-600 dark:border-slate-600 text-gray-900 dark:text-slate-100'
          }`}
        >
          Semaine
        </button>
      </div>

      {/* Vue DESKTOP - Grille actuelle inchangée */}
      <div className="hidden md:block week-shell" style={weeklyGridStyle}>
        <div className="week-day-headers">
          {days.map((day) => (
            <div key={day.name} className="day-header-label dark:text-slate-100">
              {day.name} {day.date.getDate()}
            </div>
          ))}
        </div>

        <div className="week-grid-container overflow-y-auto items-start py-2" style={gridScrollStyle}>
          <div
            className="time-gutter relative flex flex-col dark:bg-slate-900 dark:border-slate-700"
            style={{ height: containerHeight }}
          >
            {hourSlotLabels.map((time) => (
              <div
                key={time}
                className="time-label-slot relative h-[var(--weekly-grid-row-h)] pr-2 bg-white/80 dark:bg-slate-900/80"
              >
                <span className="time-label-text text-xs text-slate-500 leading-none dark:text-slate-100">
                  {time}
                </span>
              </div>
            ))}
            <div className="hour-label-final flex items-end justify-end pr-2 pb-1 mt-1 bg-white/80 text-xs text-slate-500 leading-none dark:bg-slate-900/80 dark:text-slate-100 min-h-[var(--weekly-grid-row-h)]">
              <span>{finalHourLabel}</span>
            </div>
          </div>

          <div
            className="week-grid-body dark:bg-slate-800 dark:border-slate-700"
            style={gridBodyStyle}
          >
            <GridLayer hours={hours} />
            <InteractiveLayer
              hours={hours}
              days={days}
              eventLayouts={visibleEventLayouts}
              taskLayouts={visibleTaskLayouts}
              onCellClick={onCellClick}
              onAddEvent={onAddEvent}
              onEventClick={onEventClick}
              onTaskClick={onTaskClick}
              isReadOnlyMode={isReadOnlyMode}
              positionUnit={positionUnit}
              minuteHeight={minuteHeight}
            />
          </div>
        </div>
      </div>

      {/* Vue MOBILE - Empilée par jour (mode "Semaine") OU Grille horaire (mode "Aujourd'hui") */}
      <div className="md:hidden flex flex-col w-full">
        {viewFilter === 'week' ? (
          // Mode SEMAINE : Liste verticale de cartes par jour (vue actuelle inchangée)
          <>
            {mobileDaysToShow.map((day, dayIndex) => {
              const originalDayIndex = days.findIndex(d => d.date.getTime() === day.date.getTime());
              const daySlots = originalDayIndex >= 0 ? mergedDaySlots[originalDayIndex] || [] : [];
              const dayHasContent = daySlots.some(
                (slot) => (slot.event !== null) || slot.tasks.length > 0
              );

              return (
                <div key={`mobile-day-${dayIndex}`} className={`border border-white/10 ${radius.card} ${surface.base} ${surface.border} p-3 mb-4 w-full`}>
                  {/* En-tête du jour */}
                  <div className="text-base font-semibold text-white flex items-center justify-between mb-2">
                    <span>{day.name} {day.date.getDate()}</span>
                    {!isReadOnlyMode && (
                      <button
                        type="button"
                        onClick={() => onAddEvent?.(day.date, hours[0] ?? '09:00')}
                        className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                      >
                        + Événement
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 mb-3">
                    {daySlots.map((slot) => {
                      if (slot.event) {
                        const event = slot.event;
                        const startTime = event.startDate.toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const endTime = event.endDate.toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        let bgColorClass = 'bg-gray-200 dark:bg-gray-700';
                        let borderColorClass = 'border-gray-300 dark:border-gray-600';
                        if (event.status === 'paid') {
                          bgColorClass = 'bg-green-200 dark:bg-green-500/30';
                          borderColorClass = 'border-green-300 dark:border-green-500';
                        } else if (event.status === 'unpaid') {
                          bgColorClass = 'bg-red-200 dark:bg-red-500/30';
                          borderColorClass = 'border-red-300 dark:border-red-500';
                        } else if (event.status === 'pending') {
                          bgColorClass = 'bg-orange-200 dark:bg-orange-500/30';
                          borderColorClass = 'border-orange-300 dark:border-orange-500';
                        }

                        return (
                          <div
                            key={`${slot.key}-event`}
                            onClick={() => onEventClick?.(event)}
                            className={`${bgColorClass} ${borderColorClass} relative border ${radius.button} p-2 cursor-pointer text-xs min-h-[44px] flex flex-col justify-center`}
                          >
                            <div className="font-medium text-gray-900 dark:text-white">
                              {startTime} - {endTime}
                            </div>
                            <div className="text-gray-800 dark:text-slate-200">
                              {event.client || event.description || 'Sans titre'}
                            </div>

                            {slot.eventTaskBadges.length > 0 && (
                              <div className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-1">
                                {slot.eventTaskBadges.map((badge) => {
                                  const IconComponent = getIcon(badge.iconId ?? undefined);
                                  const badgeColors = getTaskColor(badge.color);
                                  const priorityDisplay = showPriorityBadges
                                    ? getPriorityDisplay(badge.priority)
                                    : null;
                                  const statusKey: TaskStatusKey = resolveEffectiveTaskStatus(
                                    badge.status,
                                    badge.done,
                                  );
                                  const statusDisplay = TASK_STATUS_DISPLAY[statusKey];
                                  const statusIndicatorStyle = TASK_STATUS_INDICATOR_STYLES[statusKey];

                                  const badgeAriaLabelParts: string[] = [badge.label];
                                  if (statusDisplay) {
                                    badgeAriaLabelParts.push(statusDisplay.label);
                                  }
                                  if (priorityDisplay) {
                                    badgeAriaLabelParts.push(priorityDisplay.ariaLabel);
                                  }
                                  const badgeAriaLabel = badgeAriaLabelParts.join(' — ');

                                  return (
                                    <span
                                      key={`${slot.key}-badge-${badge.taskId}`}
                                      className="relative flex h-6 w-6 items-center justify-center rounded-full border text-white shadow-sm"
                                      style={{
                                        backgroundColor: badgeColors.backgroundColor,
                                        color: badgeColors.color,
                                        borderColor: badgeColors.borderColor,
                                      }}
                                      aria-label={badgeAriaLabel}
                                    >
                                      <IconComponent className="h-[14px] w-[14px]" strokeWidth={2} aria-hidden="true" />
                                      <span className="sr-only">{statusDisplay?.srLabel}</span>
                                      <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute -bottom-1 left-1/2 h-1.5 w-3 -translate-x-1/2 rounded-full border"
                                        style={{
                                          backgroundColor: statusIndicatorStyle.backgroundColor,
                                          borderColor: statusIndicatorStyle.borderColor,
                                          boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.35)',
                                        }}
                                      />
                                      {priorityDisplay ? (
                                        <span
                                          className={`pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-white/70 ${priorityDisplay.bgClass}`}
                                        >
                                          {priorityDisplay.labelNumber}
                                          <span className="sr-only">{priorityDisplay.ariaLabel}</span>
                                        </span>
                                      ) : null}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (slot.tasks.length > 0) {
                        return slot.tasks.map((task) => {
                          const startTime = task.startDate.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          const endTime = task.endDate.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          const IconComponent = getIcon(task.icon ?? undefined);
                          const colors = getTaskColor(task.color);

                          const priorityLevel =
                            task.priority === 'high' || task.priority === 'medium' || task.priority === 'low'
                              ? task.priority
                              : null;
                          const isAbsenceTask =
                            typeof task.type === 'string' && task.type.trim().toLowerCase() === 'absence';
                          const slotStatusRaw =
                            typeof slot.status === 'string'
                              ? slot.status.trim().toLowerCase()
                              : undefined;
                          const rawStatus =
                            typeof task.status === 'string'
                              ? task.status.trim().toLowerCase()
                              : slotStatusRaw;
                          const slotDone = slot.done === true;
                          const statusKey: TaskStatusKey = resolveEffectiveTaskStatus(
                            rawStatus,
                            task.done === true || slotDone,
                          );
                          const statusDisplay =
                            showStatusBadges && !isAbsenceTask ? TASK_STATUS_DISPLAY[statusKey] : null;
                          const StatusIcon = statusDisplay?.iconComponent;
                          
                          const formattedPrice =
                            typeof task.price === 'number'
                              ? `${task.price.toLocaleString('fr-FR', {
                                  minimumFractionDigits: task.price % 1 === 0 ? 0 : 2,
                                  maximumFractionDigits: 2,
                                })} €`
                              : typeof task.price === 'string'
                              ? task.price.trim()
                              : '';
                          const participantBadges = Array.isArray(task.teamParticipants)
                            ? task.teamParticipants.slice(0, 3)
                            : [];
                          const hasParticipantBadges = participantBadges.length > 0;
                          const additionalParticipants = Array.isArray(task.teamParticipants)
                            ? Math.max(0, task.teamParticipants.length - participantBadges.length)
                            : 0;

                          const isInteractive =
                            !isReadOnlyMode && !task.readOnly && typeof onTaskClick === 'function';

                          return (
                            <div
                              key={`${slot.key}-task-${task.occurrenceId}`}
                              onClick={() => isInteractive && onTaskClick?.(task)}
                              className={`${radius.button} p-2 text-xs min-h-[44px] flex items-center gap-2 ${
                                isInteractive ? 'cursor-pointer' : ''
                              }`}
                              style={{
                                backgroundColor: colors.backgroundColor,
                                border: `1px solid ${colors.borderColor}`,
                                color: colors.color,
                              }}
                            >
                              <IconComponent className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
                              <div className="flex flex-col flex-1 min-w-0 gap-1">
                                <div className="flex min-w-0 items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium truncate block">{task.label}</span>
                                    {statusDisplay && StatusIcon ? (
                                      <span
                                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusDisplay.chipClass}`}
                                      >
                                        <StatusIcon className={`h-3.5 w-3.5 ${statusDisplay.iconClass}`} aria-hidden="true" />
                                        <span>{statusDisplay.label}</span>
                                        <span className="sr-only">{statusDisplay.srLabel}</span>
                                      </span>
                                    ) : null}
                                  </div>
                                  {showPriorityBadges && priorityLevel ? (
                                    <div className="flex-shrink-0">
                                      <PriorityNumberBadge priority={priorityLevel} show />
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] opacity-90">
                                  <span>
                                    {startTime} - {endTime}
                                  </span>
                                  {formattedPrice && <span>{formattedPrice}</span>}
                                </div>
                                {hasParticipantBadges && (
                                  <div className="flex items-center gap-1 text-[11px] pt-1">
                                    {participantBadges.map((participant, index) => {
                                      const initials =
                                        typeof participant?.initials === 'string' &&
                                        participant.initials.trim().length > 0
                                          ? participant.initials.trim()
                                          : '??';
                                      return (
                                        <span
                                          key={`task-participant-${task.occurrenceId}-${participant?.id || index}`}
                                          className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold"
                                          style={{
                                            backgroundColor: participant?.background || colors.backgroundColor,
                                            borderColor: participant?.border || colors.borderColor,
                                            color: participant?.text || colors.color,
                                          }}
                                          title={participant?.name ? `Créé par ${participant.name}` : undefined}
                                          aria-label={participant?.name ? `Créé par ${participant.name}` : 'Créé par un membre'}
                                        >
                                          {initials}
                                        </span>
                                      );
                                    })}
                                    {additionalParticipants > 0 && (
                                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                        +{additionalParticipants}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        });
                      }

                      return null;
                    })}
                  </div>

                  {/* Message si pas d'événements ni de tâches */}
                  {!dayHasContent && (
                    <div className="text-sm text-gray-500 dark:text-slate-400 text-center py-4">
                      Aucun événement ou tâche
                    </div>
                  )}
                </div>
              );
            })}

            {/* Message si aucune journée à afficher */}
            {mobileDaysToShow.length === 0 && (
              <div className="text-center text-gray-500 dark:text-slate-400 py-8">
                Aucune journée à afficher
              </div>
            )}
          </>
        ) : (
          // Mode AUJOURD'HUI : Grille horaire verticale (nouvelle vue)
          <>
            {mobileDaysToShow.length > 0 ? (
              (() => {
                const day = mobileDaysToShow[0];
                const originalDayIndex = days.findIndex(d => d.date.getTime() === day.date.getTime());
                const dayEvents = originalDayIndex >= 0 ? visibleEventLayouts[originalDayIndex] || [] : [];
                const dayTasks = originalDayIndex >= 0 ? visibleTaskLayouts[originalDayIndex] || [] : [];

                return (
                  <div className="w-full flex flex-col">
                    {/* En-tête du jour */}
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Aujourd'hui — {day.name} {day.date.getDate()}
                      </h2>
                      {!isReadOnlyMode && (
                        <button
                          type="button"
                          onClick={() => onAddEvent?.(day.date, hours[0] ?? '09:00')}
                          className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 min-h-[44px]"
                        >
                          + Événement
                        </button>
                      )}
                    </div>

                    {/* Grille horaire verticale */}
                    <div
                      className={`relative overflow-y-auto border border-white/10 ${radius.card} ${surface.base} pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
                      style={{ maxHeight: 'calc(100vh - 280px)' }}
                    >
                      <div className="grid grid-cols-[60px_1fr] gap-0">
                        {/* Colonne des heures + Colonne des événements */}
                        {hours.map((hourLabel) => (
                          <React.Fragment key={hourLabel}>
                            {/* Heure à gauche */}
                            <div
                              className={`sticky left-0 ${surface.base} border-b border-white/10 flex items-start justify-end pr-2 py-1`}
                              style={{ height: `${SLOT_HEIGHT}px` }}
                            >
                              <span className="text-xs text-gray-400 dark:text-slate-400">{hourLabel}</span>
                            </div>

                            {/* Cellule de temps à droite */}
                            <div className="relative border-b border-white/10" style={{ height: `${SLOT_HEIGHT}px` }}>
                              {!isReadOnlyMode && (
                                <button
                                  type="button"
                                  className="absolute inset-0 hover:bg-white/5 transition-colors"
                                  onClick={() => onCellClick?.(day.date, hourLabel)}
                                />
                              )}
                            </div>
                          </React.Fragment>
                        ))}
                        <div className={`hour-label-final sticky left-0 ${surface.base} flex items-start justify-end pr-2 pt-1 pb-1 mt-1 text-xs text-gray-400 dark:text-slate-300`}>
                          <span>{finalHourLabel}</span>
                        </div>
                      </div>

                      {/* Conteneur absolu pour les événements */}
                      <div className="absolute top-0 left-[60px] right-0 bottom-0 pointer-events-none">
                        <div className="relative w-full h-full">
                          {/* Événements */}
                          {dayEvents.map(({ event, top, height }) => {
                            if (height <= 0) return null;

                            const topValue = formatPositionValue(top, positionUnit, minuteHeight);
                            const heightValue = formatPositionValue(height, positionUnit, minuteHeight);

                            const startTime = event.startDate.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            const endTime = event.endDate.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });

                            let bgColorClass = 'bg-gray-200 dark:bg-gray-700';
                            let borderColorClass = 'border-gray-300 dark:border-gray-600';
                            if (event.status === 'paid') {
                              bgColorClass = 'bg-green-200 dark:bg-green-500/30';
                              borderColorClass = 'border-green-300 dark:border-green-500';
                            } else if (event.status === 'unpaid') {
                              bgColorClass = 'bg-red-200 dark:bg-red-500/30';
                              borderColorClass = 'border-red-300 dark:border-red-500';
                            } else if (event.status === 'pending') {
                              bgColorClass = 'bg-orange-200 dark:bg-orange-500/30';
                              borderColorClass = 'border-orange-300 dark:border-orange-500';
                            }

                            return (
                              <div
                                key={event.id}
                                onClick={() => onEventClick?.(event)}
                            className={`absolute left-1 right-1 ${bgColorClass} ${borderColorClass} border ${radius.button} shadow-sm cursor-pointer text-xs overflow-hidden pointer-events-auto`}
                            style={{
                              top: topValue,
                              height: heightValue,
                              minHeight: '44px',
                            }}
                          >
                                <div className="p-2 h-full flex flex-col justify-center relative pr-8 pb-6">
                                  <div className="font-medium text-gray-900 dark:text-white text-sm">
                                    {startTime} - {endTime}
                                  </div>
                                  <div className="text-gray-800 dark:text-slate-200 truncate">
                                    {event.client || event.description || 'Sans titre'}
                                  </div>
                                  {event.attachedTaskBadges.length > 0 && (
                                    <div className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-1">
                                      {event.attachedTaskBadges.map((badge) => {
                                        const IconComponent = getIcon(badge.iconId ?? undefined);
                                        const badgeColors = getTaskColor(badge.color);
                                        const priorityDisplay = showPriorityBadges
                                          ? getPriorityDisplay(badge.priority)
                                          : null;

                                        return (
                                          <span
                                            key={`${event.id}-badge-${badge.taskId}`}
                                            className="relative flex h-6 w-6 items-center justify-center rounded-full border text-white shadow-sm"
                                            style={{
                                              backgroundColor: badgeColors.backgroundColor,
                                              color: badgeColors.color,
                                              borderColor: badgeColors.borderColor,
                                            }}
                                          >
                                            <IconComponent className="h-[14px] w-[14px]" strokeWidth={2} aria-hidden="true" />
                                            {priorityDisplay ? (
                                              <span
                                                className={`pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-white/70 ${priorityDisplay.bgClass}`}
                                              >
                                                {priorityDisplay.labelNumber}
                                                <span className="sr-only">{priorityDisplay.ariaLabel}</span>
                                              </span>
                                            ) : null}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Tâches hebdomadaires */}
                          {dayTasks.map(({ task, top, height, backgroundColor, borderColor, textColor }) => {
                            if (height <= 0) return null;

                            const topValue = formatPositionValue(top, positionUnit, minuteHeight);
                            const heightValue = formatPositionValue(height, positionUnit, minuteHeight);

                            const startTime = task.startDate.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            const endTime = task.endDate.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            const IconComponent = getIcon(task.icon ?? undefined);

                            const formattedPrice =
                              typeof task.price === 'number'
                                ? `${task.price.toLocaleString('fr-FR', {
                                    minimumFractionDigits: task.price % 1 === 0 ? 0 : 2,
                                    maximumFractionDigits: 2,
                                  })} €`
                                : typeof task.price === 'string'
                                ? task.price.trim()
                                : '';

                            const isInteractive =
                              !isReadOnlyMode && !task.readOnly && typeof onTaskClick === 'function';

                            return (
                              <div
                                key={task.occurrenceId}
                                onClick={() => isInteractive && onTaskClick?.(task)}
                                className={`absolute left-1 right-1 ${radius.button} shadow-sm text-xs overflow-hidden pointer-events-auto ${
                                  isInteractive ? 'cursor-pointer' : ''
                                }`}
                                style={{
                                  top: topValue,
                                  height: heightValue,
                                  minHeight: '44px',
                                  backgroundColor,
                                  border: `1px solid ${borderColor}`,
                                  color: textColor,
                                }}
                              >
                                <div className="p-2 h-full flex items-center gap-2">
                                  <IconComponent className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <span className="font-medium truncate text-sm">{task.label}</span>
                                    <div className="flex items-center gap-2 text-[11px] opacity-90">
                                      <span>
                                        {startTime} - {endTime}
                                      </span>
                                      {formattedPrice && <span>{formattedPrice}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Message si aucun événement ni tâche */}
                    {dayEvents.length === 0 && dayTasks.length === 0 && (
                      <div className="text-center text-gray-500 dark:text-slate-400 py-8">
                        Aucun événement ou tâche pour aujourd'hui
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="text-center text-gray-500 dark:text-slate-400 py-8">
                Aucune journée à afficher
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PlannerGrid;
