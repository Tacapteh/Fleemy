import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import "../styles/WeeklyGrid.css";
import { useFirebaseUser } from "../firebase";
import TaskBadge from "./TaskBadge";
import { slotsOverlap, calculateTopPosition, calculateHeight, getDayIndex } from "../utils/time";
import { getTaskColor } from "../constants/colors";

const toHM = v => {
  if (typeof v === "string") {
    if (v.includes(":")) return v;
    if (/^\d{3,4}$/.test(v)) {
      const s = v.padStart(4, "0");
      return s.slice(0, 2) + ":" + s.slice(2);
    }
  }
  if (v && typeof v === "object") {
    if (typeof v.toDate === "function") {
      const d = v.toDate();
      return (
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0")
      );
    }
    if (v instanceof Date) {
      return (
        String(v.getHours()).padStart(2, "0") +
        ":" +
        String(v.getMinutes()).padStart(2, "0")
      );
    }
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const hh = String(Math.floor(v / 60)).padStart(2, "0");
    const mm = String(v % 60).padStart(2, "0");
    return hh + ":" + mm;
  }
  return "00:00";
};
const toDateOnly = v => {
  if (!v) return null;
  if (typeof v === "string") return new Date(v + "T00:00:00");
  if (v && typeof v.toDate === "function") {
    const d = v.toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  return null;
};
const dayIndexFrom = (dateLike, weekStartDate) => {
  const d = toDateOnly(dateLike);
  if (!d) return -1;
  const ws = toDateOnly(weekStartDate) || new Date();
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((d - ws) / MS);
};
const minutesFromHM = hm => {
  const [h, m] = toHM(hm).split(":").map(n => parseInt(n, 10));
  return h * 60 + (m || 0);
};

const DAY_NAMES = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

const DAY_START = 9;
const DAY_END = 18; // exclusive (fin à 18h00)
const SLOT_HEIGHT = 64;

// Composant légende des statuts
const StatusLegend = () => (
  <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
    <span className="text-sm font-medium text-gray-700">Statuts :</span>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 bg-green-200 border border-gray-200 rounded"></div>
      <span className="text-xs text-gray-600">Payé</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 bg-red-200 border border-gray-200 rounded"></div>
      <span className="text-xs text-gray-600">Impayé</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 bg-orange-200 border border-gray-200 rounded"></div>
      <span className="text-xs text-gray-600">En attente</span>
    </div>
  </div>
);

const GridLayer = React.memo(({ hours, days }) => (
  <div className="grid-layer">
    <div className="days-grid">
      {/* Les lignes horizontales sont créées via CSS */}
    </div>
  </div>
));

const InteractiveLayer = React.memo(function InteractiveLayer({
  columns,
  taskColumns,
  hours,
  days,
  onCellClick,
  onEventClick,
  onAddEvent,
  onTaskClick,
  isReadOnlyMode,
}) {
  const [draggingId, setDraggingId] = useState(null);

  return (
    <div className="interactive-layer">
      {/* Zones cliquables pour chaque jour et chaque heure */}
      {days.map((day, dayIndex) => (
        <div
          key={dayIndex}
          className="day-column"
          style={{ gridColumn: dayIndex + 1, gridRow: "1 / -1" }}
        >
          {/* Bouton + en haut de la colonne */}
          {!isReadOnlyMode && (
            <button
              className="add-event-btn"
              onClick={() => onAddEvent(day.date, "09:00")}
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
              onClick={() => !isReadOnlyMode && onCellClick(day.date, time)}
              disabled={isReadOnlyMode}
              data-testid={`time-slot-${dayIndex}-${hourIndex}`}
            />
          ))}
        </div>
      ))}

      {/* Événements positionnés au-dessus */}
      {columns.map((dayEvents, dayIndex) => (
        <div
          key={`events-${dayIndex}`}
          className="events-container"
          style={{ gridColumn: dayIndex + 1 }}
        >
          {dayEvents.map((e) => {
            let top = e.top;
            let height = e.height;
            if (typeof e._topMin === "number" && typeof e._durMin === "number") {
              const startMinutes = DAY_START * 60;
              const endMinutes = DAY_END * 60;
              const clampedStart = Math.max(e._topMin, startMinutes);
              const clampedEnd = Math.min(e._topMin + e._durMin, endMinutes);
              if (clampedStart >= clampedEnd) return null;
              top = ((clampedStart - startMinutes) / (endMinutes - startMinutes)) * 100;
              height = ((clampedEnd - clampedStart) / (endMinutes - startMinutes)) * 100;
            }

            // Chercher les tâches qui se chevauchent avec cet événement
            const overlappingTasksRaw = taskColumns[dayIndex].filter(task => {
              // Vérifier que les dates sont valides
              if (!task.start || !task.end || !e.start || !e.end) return false;

              const eventStart = e.start instanceof Date ? e.start : new Date(e.start);
              const eventEnd = e.end instanceof Date ? e.end : new Date(e.end);

              const overlaps = slotsOverlap(
                { startDate: eventStart, endDate: eventEnd },
                { startDate: task.start, endDate: task.end }
              );
              
              if (overlaps) {
                console.log('[WeeklyGrid] Chevauchement détecté:', {
                  event: { id: e.id, start: eventStart, end: eventEnd },
                  task: { id: task.occurrenceId, start: task.start, end: task.end },
                  dayIndex
                });
              }
              
              return overlaps;
            });

            // Dédupliquer les tâches par occurrenceId (éviter doublons après reload)
            const uniqueOverlappingTasks = [];
            const seenTaskIds = new Set();
            overlappingTasksRaw.forEach(task => {
              if (!seenTaskIds.has(task.occurrenceId)) {
                seenTaskIds.add(task.occurrenceId);
                uniqueOverlappingTasks.push(task);
              }
            });

            // Trier par occurrenceId pour ordre stable
            const overlappingTasks = uniqueOverlappingTasks.sort((a, b) => 
              a.occurrenceId.localeCompare(b.occurrenceId)
            );

            return (
              <div
                key={e.id}
                draggable={!isReadOnlyMode && !e.readOnly}
                onDragStart={() => !isReadOnlyMode && setDraggingId(e.id)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => onEventClick && onEventClick(e)}
                className={`event-chip status-${e.status}${draggingId === e.id ? " dragging" : ""}`}
                style={{
                  left: `${(e.col * 100) / e.colCount}%`,
                  width: `${100 / e.colCount}%`,
                  top: `${top}%`,
                  height: `${height}%`,
                }}
                data-testid={`event-${e.id}`}
              >
                <div className="title truncate">
                  {e.description || e.title || e.client || "Événement"}
                </div>
                {e.client && (
                  <div className="subtitle truncate">
                    {e.client}
                  </div>
                )}
                
                {/* Icônes de tâches chevauchantes - coin inférieur droit (position absolue) */}
                {overlappingTasks.length > 0 && (
                  <div 
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      display: 'flex',
                      gap: '4px',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                      maxWidth: 'calc(100% - 8px)',
                      zIndex: 10,
                    }}
                  >
                    {overlappingTasks.map((task) => (
                      <TaskBadge
                        key={task.occurrenceId}
                        task={task}
                        mode="icon-only"
                        isReadOnly={task.readOnly || isReadOnlyMode}
                        onClick={onTaskClick}
                        data-testid={`task-icon-overlap-${task.occurrenceId}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Tâches autonomes (qui ne se chevauchent pas avec des événements) */}
      {taskColumns.map((dayTasks, dayIndex) => {
        // Étape 1: Filtrer les tâches qui ne chevauchent PAS avec des événements
        const standaloneTasks = dayTasks.filter((task) => {
          if (!task.start || !task.end) {
            console.warn('Tâche avec dates invalides:', task);
            return false;
          }

          const hasOverlap = columns[dayIndex].some(event => {
            if (!event.start || !event.end) return false;

            const eventStart = event.start instanceof Date ? event.start : new Date(event.start);
            const eventEnd = event.end instanceof Date ? event.end : new Date(event.end);

            return slotsOverlap(
              { startDate: eventStart, endDate: eventEnd },
              { startDate: task.start, endDate: task.end }
            );
          });

          return !hasOverlap; // Garder seulement les tâches sans chevauchement avec events
        });

        // Étape 2: Dédupliquer par occurrenceId (éviter les doublons après reload Firestore)
        const uniqueTasks = [];
        const seenIds = new Set();
        standaloneTasks.forEach(task => {
          if (!seenIds.has(task.occurrenceId)) {
            seenIds.add(task.occurrenceId);
            uniqueTasks.push(task);
          }
        });

        // Étape 3: Grouper les tâches par créneau horaire (même start/end = même slot)
        const taskGroups = new Map();
        uniqueTasks.forEach(task => {
          const startTime = task.start.getTime();
          const endTime = task.end.getTime();
          const slotKey = `${startTime}-${endTime}`;

          if (!taskGroups.has(slotKey)) {
            taskGroups.set(slotKey, []);
          }
          taskGroups.get(slotKey).push(task);
        });

        // Étape 4: Rendre un seul bloc par groupe avec toutes les icônes
        const taskBlocks = [];
        taskGroups.forEach((tasksInSlot, slotKey) => {
          if (tasksInSlot.length === 0) return;

          // Trier par occurrenceId pour un ordre stable
          tasksInSlot.sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId));

          const firstTask = tasksInSlot[0];
          const top = calculateTopPosition(firstTask.start);
          const height = calculateHeight(firstTask.start, firstTask.end);

          if (height <= 0) return;

          // Générer un ID unique pour le groupe
          const groupId = tasksInSlot.map(t => t.occurrenceId).join('_');

          taskBlocks.push(
            <div
              key={groupId}
              className="task-standalone"
              style={{
                top: `${top}%`,
                height: `${height}%`,
                left: '2px',
                right: '2px',
              }}
              data-testid={`task-standalone-group-${slotKey}`}
            >
              <div className="flex flex-wrap gap-1 p-1 h-full items-center justify-start">
                {tasksInSlot.map((task) => (
                  <TaskBadge
                    key={task.occurrenceId}
                    task={task}
                    size={tasksInSlot.length > 1 ? "small" : "normal"}
                    isReadOnly={task.readOnly || isReadOnlyMode}
                    onClick={onTaskClick}
                    data-testid={`task-badge-${task.occurrenceId}`}
                  />
                ))}
              </div>
            </div>
          );
        });

        return (
          <div
            key={`tasks-${dayIndex}`}
            className="tasks-container"
            style={{ gridColumn: dayIndex + 1 }}
          >
            {taskBlocks}
          </div>
        );
      })}
    </div>
  );
});

export default function WeeklyGrid(props) {
  const events = Array.isArray(props.events) ? props.events : [];
  const tasks = Array.isArray(props.tasks) ? props.tasks : [];
  const isReadOnlyMode = props.isReadOnlyMode || false;
  const weekStart =
    props.weekStart && typeof props.weekStart.toDate === "function"
      ? props.weekStart.toDate()
      : props.weekStart instanceof Date
      ? props.weekStart
      : new Date(props.weekStart);
  const { onSlotSelect, onEventClick, onTaskClick } = props;
  const user = useFirebaseUser();

  const hours = useMemo(
    () =>
      Array.from(
        { length: 9 }, // Exactement 9 heures (09:00-17:00, pas de ligne pour 18:00)
        (_, i) => `${String(9 + i).padStart(2, "0")}:00`
      ),
    []
  );
  const timeLabels = React.useMemo(() => [...hours, "18:00"], [hours]); // Affichage jusqu'à 18:00

  const days = useMemo(() => {
    const start = new Date(weekStart);
    return DAY_NAMES.map((name, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { name, date: d };
    });
  }, [weekStart.getTime()]);

  const columns = Array.from({ length: 7 }, () => []);
  const taskColumns = Array.from({ length: 7 }, () => []);

  // Traitement des événements
  events.forEach((e) => {
    const idx = Number.isInteger(e.day)
      ? e.day
      : dayIndexFrom(e.date, weekStart);
    if (idx >= 0 && idx < 7) {
      // Gérer start et end comme Date ou HH:MM
      let startMinutes, endMinutes;

      if (e.start instanceof Date) {
        startMinutes = e.start.getHours() * 60 + e.start.getMinutes();
      } else {
        startMinutes = minutesFromHM(e.start);
      }

      if (e.end instanceof Date) {
        endMinutes = e.end.getHours() * 60 + e.end.getMinutes();
      } else {
        endMinutes = minutesFromHM(e.end);
      }

      const top = Math.max(0, startMinutes);
      const dur = Math.max(15, endMinutes - top);

      columns[idx].push({
        ...e,
        _topMin: top,
        _durMin: dur,
        // Normaliser start et end comme Date pour la cohérence
        start: e.start instanceof Date ? e.start : new Date(`${e.date}T${toHM(e.start)}`),
        end: e.end instanceof Date ? e.end : new Date(`${e.date}T${toHM(e.end)}`),
      });
    }
  });

  // Traitement des tâches hebdomadaires (nouveau format)
  tasks.forEach((taskOccurrence) => {
    const { dayIndex, startDate, endDate } = taskOccurrence;

    if (typeof dayIndex === 'number' && dayIndex >= 0 && dayIndex < 7 && startDate && endDate) {
      // Vérifier que startDate et endDate sont valides
      if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
        console.warn('Tâche avec dates invalides:', taskOccurrence);
        return;
      }

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn('Tâche avec timestamps invalides:', taskOccurrence);
        return;
      }

      // Calculer la position en minutes depuis le début de la journée
      const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
      const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
      const duration = Math.max(15, endMinutes - startMinutes);

      if (duration <= 0) {
        console.warn('Tâche avec durée invalide:', taskOccurrence);
        return;
      }

      taskColumns[dayIndex].push({
        ...taskOccurrence,
        _topMin: startMinutes,
        _durMin: duration,
        start: startDate,
        end: endDate,
      });
    } else {
      console.warn('Tâche avec dayIndex invalide:', taskOccurrence);
    }
  });

  columns.forEach((list) => {
    list.sort((a, b) => a._topMin - b._topMin);
    const cols = [];
    list.forEach((ev) => {
      let col = 0;
      while (cols[col] && cols[col] > ev._topMin) col++;
      ev.col = col;
      cols[col] = ev._topMin + ev._durMin;
    });
    const colCount = cols.length || 1;
    list.forEach((ev) => (ev.colCount = colCount));
  });

  const onCellClick = useCallback(
    (date, timeString) => {
      if (!user) {
        console.warn("Utilisateur non connecté, clic cellule bloqué");
        return;
      }

      const [h, m] = timeString.split(":").map(Number);
      const start = new Date(date);
      start.setHours(h, m, 0, 0);

      if (onSlotSelect) {
        onSlotSelect(start);
      }
    },
    [onSlotSelect, user]
  );

  const onAddEvent = useCallback(
    (date, timeString) => {
      if (!user) {
        console.warn("Utilisateur non connecté, ajout événement bloqué");
        return;
      }
      const [h, m] = timeString.split(":").map(Number);
      const start = new Date(date);
      start.setHours(h, m, 0, 0);
      if (onSlotSelect) {
        onSlotSelect(start);
      }
    },
    [onSlotSelect, user]
  );

  const wrapperRef = useRef(null);

  const containerHeight = useMemo(() => hours.length * SLOT_HEIGHT, [hours]);

  if (!user) {
    return <div>Chargement...</div>;
  }

  return (
    <div ref={wrapperRef} className="week-shell">
      {/* Légende des statuts */}
      <StatusLegend />
      
      {/* Header des jours - en dehors de la grille */}
      <div className="week-day-headers">
        {days.map((d) => (
          <div key={d.name} className="day-header-label">
            {d.name} {d.date.getDate()}
          </div>
        ))}
      </div>

      <div className="week-grid-container">
        {/* Gouttière des heures - séparée et stickée */}
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

        {/* Grille principale */}
        <div
          className="week-grid-body"
          style={{
            height: containerHeight,
            "--weekly-grid-slot-height": `${SLOT_HEIGHT}px`,
            "--weekly-grid-row-h": `${SLOT_HEIGHT}px`,
          }}
        >
          <GridLayer hours={hours} days={days} />
          <InteractiveLayer
            columns={columns}
            taskColumns={taskColumns}
            hours={hours}
            days={days}
            onCellClick={onCellClick}
            onEventClick={onEventClick}
            onAddEvent={onAddEvent}
            onTaskClick={onTaskClick}
            isReadOnlyMode={isReadOnlyMode}
          />
        </div>
      </div>
    </div>
  );
}
