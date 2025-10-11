import React, { useMemo, useCallback, useRef } from 'react';
import '../styles/WeeklyGrid.css';
import { useFirebaseUser } from '../firebase';
import { calculateHeight, calculateTopPosition } from '../utils/time';
import { getTaskColor } from '../constants/colors';
import {
  selectDisplayModel,
  DisplayEvent,
  DisplayTaskGroup,
  TaskOccurrence,
  DateRange,
  PlannerEventInput,
} from '../selectors/planningSelectors';
import EventCard from './EventCard';
import TaskBadge from './TaskBadge';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SLOT_HEIGHT = 64;

const StatusLegend = React.memo(() => (
  <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
    <span className="text-sm font-medium text-gray-700">Statuts :</span>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 bg-green-200 border border-gray-200 rounded" />
      <span className="text-xs text-gray-600">Payé</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 bg-red-200 border border-gray-200 rounded" />
      <span className="text-xs text-gray-600">Impayé</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 bg-orange-200 border border-gray-200 rounded" />
      <span className="text-xs text-gray-600">En attente</span>
    </div>
  </div>
));

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

interface TaskGroupLayout {
  group: DisplayTaskGroup;
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
  taskLayouts: TaskGroupLayout[][];
  onCellClick?: (date: Date, hour: string) => void;
  onAddEvent?: (date: Date, hour: string) => void;
  onEventClick?: (event: DisplayEvent) => void;
  onTaskClick?: (task: TaskOccurrence) => void;
  isReadOnlyMode?: boolean;
}

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

            return (
              <EventCard
                key={event.id}
                event={event}
                onClick={onEventClick}
                style={{
                  top: `${top}%`,
                  height: `${height}%`,
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
          {dayTasks.map(({ group, top, height, backgroundColor, borderColor, textColor }) => {
            if (height <= 0) return null;
            return (
              <div
                key={group.id}
                className="task-standalone"
                style={{
                  top: `${top}%`,
                  height: `${height}%`,
                  left: '2px',
                  right: '2px',
                  backgroundColor,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                }}
                data-testid={`task-standalone-group-${group.id}`}
              >
                <div className="flex flex-wrap gap-1 p-1 h-full items-center justify-start">
                  {group.tasks.map((task) => (
                    <TaskBadge
                      key={task.occurrenceId}
                      task={task}
                      mode="icon-only"
                      isReadOnly={task.readOnly || isReadOnlyMode}
                      onClick={onTaskClick}
                      data-testid={`task-badge-${task.occurrenceId}`}
                    />
                  ))}
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

  const hours = useMemo(
    () => Array.from({ length: 9 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`),
    []
  );
  const timeLabels = useMemo(() => [...hours, '18:00'], [hours]);

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

        const top = calculateTopPosition(event.startDate, true);
        const height = calculateHeight(event.startDate, event.endDate, true);

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
  }, [displayEvents]);

  const taskLayouts = useMemo(() => {
    const perDay: TaskGroupLayout[][] = Array.from({ length: 7 }, () => []);

    displayTaskGroups
      .filter((group) => !group.attachedToEvent)
      .forEach((group) => {
        if (group.dayIndex < 0 || group.dayIndex > 6) return;
        const top = calculateTopPosition(group.startDate, true);
        const height = calculateHeight(group.startDate, group.endDate, true);
        const firstTask = group.tasks[0];
        const colors = getTaskColor(firstTask?.color || '');

        perDay[group.dayIndex].push({
          group,
          top,
          height,
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          textColor: colors.color,
        });
      });

    return perDay;
  }, [displayTaskGroups]);

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
      <StatusLegend />

      <div className="week-day-headers">
        {days.map((day) => (
          <div key={day.name} className="day-header-label">
            {day.name} {day.date.getDate()}
          </div>
        ))}
      </div>

      <div className="week-grid-container">
        <div className="time-gutter">
          {timeLabels.map((time, index) => (
            <div
              key={time}
              className="time-label"
              style={{ top: `calc(${index} * var(--weekly-grid-row-h))` }}
            >
              {time}
            </div>
          ))}
        </div>

        <div
          className="week-grid-body"
          style={{
            height: containerHeight,
            '--weekly-grid-slot-height': `${SLOT_HEIGHT}px`,
            '--weekly-grid-row-h': `${SLOT_HEIGHT}px`,
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
          />
        </div>
      </div>
    </div>
  );
};

export default PlannerGrid;
