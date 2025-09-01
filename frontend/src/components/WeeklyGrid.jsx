import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import "../styles/WeeklyGrid.css";
import { useFirebaseUser } from "../firebase";

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

function getDayIndex(event) {
  const date = new Date(event.start);
  return (date.getDay() + 6) % 7;
}

function getTaskDayIndex(task) {
  const date = new Date(task.start);
  return (date.getDay() + 6) % 7;
}

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

function placeEventsByDay(events, dayStartHour = 9, dayEndHour = 18) {
  const startMinutes = dayStartHour * 60;
  const totalMinutes = (dayEndHour - dayStartHour) * 60; // Exactement 9 heures (9h-18h)
  const columns = Array.from({ length: 7 }, () => []);

  (events || []).forEach((e) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const day = getDayIndex(e);

    // Tronquer l'affichage si hors plage 09:00-18:00
    const startMinutesFromDay = start.getHours() * 60 + start.getMinutes();
    const endMinutesFromDay = end.getHours() * 60 + end.getMinutes();

    const clampedStartMinutes = Math.max(startMinutesFromDay, startMinutes);
    const clampedEndMinutes = Math.min(endMinutesFromDay, startMinutes + totalMinutes);

    // Ignorer si complètement hors plage
    if (clampedStartMinutes >= clampedEndMinutes) return;

    const top = ((clampedStartMinutes - startMinutes) / totalMinutes) * 100;
    const height = ((clampedEndMinutes - clampedStartMinutes) / totalMinutes) * 100;

    const d = Number.isInteger(day) && day >= 0 && day < 7 ? day : null;
    if (d === null) return;
    (columns[d] ||= []).push({
      ...e,
      start,
      end,
      top,
      height,
    });
  });

  // Gérer les chevauchements avec partage de largeur
  columns.forEach((list) => {
    list.sort((a, b) => a.start - b.start);
    const columns = [];
    list.forEach((ev) => {
      let col = 0;
      while (columns[col] && columns[col] > ev.start) col++;
      ev.col = col;
      columns[col] = ev.end;
    });
    const colCount = columns.length || 1;
    list.forEach((ev) => (ev.colCount = colCount));
  });

  return columns;
}

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
          <button
            className="add-event-btn"
            onClick={() => onAddEvent(day.date, "09:00")}
            title="Ajouter un événement"
          >
            +
          </button>

          {hours.map((time, hourIndex) => (
            <button
              key={time}
              type="button"
              className="time-slot-cell"
              style={{ gridRow: hourIndex + 1 }}
              onClick={() => onCellClick(day.date, time)}
            />
          ))}

          {/* Affichage des tâches dans les cellules */}
          {taskColumns[dayIndex]
            .map((task) => {
              const taskStart = new Date(task.start);
              const hourIndex = taskStart.getHours() - DAY_START;

              if (hourIndex < 0 || hourIndex >= hours.length) return null;

              return (
                <div
                  key={task.id}
                  className="task-indicator"
                  style={{
                    gridRow: hourIndex + 1,
                    backgroundColor: task.color || "#10b981",
                  }}
                  title={task.title}
                >
                  <span className="task-icon">{task.icon || "📋"}</span>
                </div>
              );
            })}
        </div>
      ))}

      {/* Événements positionnés au-dessus */}
      {columns.map((dayEvents, dayIndex) => (
        <div
          key={dayIndex}
          className="events-container"
          style={{ gridColumn: dayIndex + 1 }}
        >
          {dayEvents.map((e) => (
            <div
              key={e.id}
              draggable
              onDragStart={() => setDraggingId(e.id)}
              onDragEnd={() => setDraggingId(null)}
              onClick={() => onEventClick && onEventClick(e)}
              className={`event-chip status-${e.status}${draggingId === e.id ? " dragging" : ""}`}
              style={{
                left: `${(e.col * 100) / e.colCount}%`,
                width: `${100 / e.colCount}%`,
                top: `${e.top}%`,
                height: `${e.height}%`,
              }}
            >
              <div className="title truncate">
                {e.description || e.title || e.client || "Événement"}
              </div>
              {e.client && (
                <div className="subtitle truncate">
                  {e.client}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

export default function WeeklyGrid(props) {
  const events = Array.isArray(props.events) ? props.events : [];
  const tasks = Array.isArray(props.tasks) ? props.tasks : [];
  const { onSlotSelect, onEventClick, weekStart = new Date() } = props;
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

  const columns = useMemo(
    () => placeEventsByDay(events, DAY_START, DAY_END),
    [events]
  );

  const taskColumns = useMemo(() => {
    const cols = Array.from({ length: 7 }, () => []);
    tasks.forEach((t) => {
      const day = getTaskDayIndex(t);
      if (Number.isInteger(day) && day >= 0 && day < 7) (cols[day] ||= []).push(t);
    });
    return cols;
  }, [tasks]);

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
          />
        </div>
      </div>
    </div>
  );
}
