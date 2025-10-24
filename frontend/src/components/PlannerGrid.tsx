import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import '../styles/WeeklyGrid.css';
import { useFirebaseUser } from '../firebase';
import { calculateHeight, calculateTopPosition } from '../utils/time';
import { getTaskColor } from '../constants/colors';
import { getIcon } from '../icons/registry';
import {
  selectDisplayModel,
  DisplayEvent,
  TaskOccurrence,
  DateRange,
  PlannerEventInput,
} from '../selectors/planningSelectors';
import EventCard from './EventCard';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SLOT_HEIGHT = 64;
const MOBILE_BREAKPOINT = 768;

type PositionUnit = 'percentage' | 'minutes';

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
        <div key={dayIndex} className="day-column" style={{ gridColumn: dayIndex + 1, gridRow: '1 / -1' }}>
          {!isReadOnlyMode && (
            <button
              type="button"
              className="add-event-btn"
              onClick={() => onAddEvent?.(day.date, '09:00')}
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
              className="time-slot-cell"
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

            return (
              <div
                key={task.occurrenceId}
                className={`task-standalone ${isInteractive ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500' : ''}`}
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

  const hours = useMemo(
    () => Array.from({ length: 9 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`),
    []
  );
  const timeLabels = useMemo(() => [...hours, '18:00'], [hours]);
  const positionUnit: PositionUnit = isMobileLayout ? 'minutes' : 'percentage';
  const minuteHeight = SLOT_HEIGHT / 60;

  const days = useMemo(() => {
    const base = new Date(normalizedWeekStart);
    return DAY_NAMES.map((name, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index);
      return { name, date };
    });
  }, [normalizedWeekStart]);

  const dateRange = useMemo(() => createDateRange(normalizedWeekStart), [normalizedWeekStart]);

  const { displayEvents, displayTaskGroups } = useMemo(
    () => selectDisplayModel({ dateRange, events, tasks }),
    [dateRange, events, tasks]
  );

  const eventLayouts = useMemo(() => {
    const perDay: DisplayEvent[][] = Array.from({ length: 7 }, () => []);

    displayEvents.forEach((event) => {
      if (event.dayIndex < 0 || event.dayIndex > 6) return;
      perDay[event.dayIndex].push(event);
    });

    return perDay.map((dayEvents) => {
      const sorted = [...dayEvents].sort((a, b) => {
        const diff = a.startDate.getTime() - b.startDate.getTime();
        if (diff !== 0) return diff;
        return a.endDate.getTime() - b.endDate.getTime();
      });

      const columnEndTimes: number[] = [];
      const layouts: EventLayout[] = [];

      sorted.forEach((event) => {
        const startMinutes = event.startDate.getHours() * 60 + event.startDate.getMinutes();
        const endMinutes = event.endDate.getHours() * 60 + event.endDate.getMinutes();
        let columnIndex = 0;
        while (columnEndTimes[columnIndex] !== undefined && columnEndTimes[columnIndex] > startMinutes) {
          columnIndex += 1;
        }
        columnEndTimes[columnIndex] = endMinutes;

        const top = calculateTopPosition(event.startDate, true, positionUnit);
        const height = calculateHeight(event.startDate, event.endDate, true, positionUnit);

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
  }, [displayEvents, positionUnit]);

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
          const top = calculateTopPosition(task.startDate, true, positionUnit);
          const height = calculateHeight(task.startDate, task.endDate, true, positionUnit);
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
  }, [displayTaskGroups, positionUnit]);

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

  const containerHeight = useMemo(() => hours.length * SLOT_HEIGHT, [hours]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  if (!user) {
    return <div>Chargement...</div>;
  }

  return (
    <div ref={wrapperRef} className="week-shell">
      <div className="week-day-headers">
        {days.map((day) => (
          <div key={day.name} className="day-header-label">
            {day.name} {day.date.getDate()}
          </div>
        ))}
      </div>

      <div className="week-grid-container">
        <div className="time-gutter border-r border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {timeLabels.map((time, index) => (
            <div
              key={time}
              className="time-label rounded-md border border-gray-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              style={{ top: `calc(${index} * var(--weekly-grid-row-h))` }}
            >
              {time}
            </div>
          ))}
        </div>

        <div
          className="week-grid-body border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          style={{
            height: containerHeight,
            '--weekly-grid-slot-height': `${SLOT_HEIGHT}px`,
            '--weekly-grid-row-h': `${SLOT_HEIGHT}px`,
            '--weekly-grid-minute-height': `${minuteHeight}px`,
          } as React.CSSProperties}
        >
          <GridLayer hours={hours} />
          <InteractiveLayer
            hours={hours}
            days={days}
            eventLayouts={eventLayouts}
            taskLayouts={taskLayouts}
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
  );
};

export default PlannerGrid;
