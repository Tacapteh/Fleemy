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

// Fonction utilitaire pour obtenir la classe de couleur selon le statut
const getStatusColorClass = (status) => {
  switch (status) {
    case 'paid':
      return 'bg-green-200 text-gray-800 border-gray-200';
    case 'pending':
      return 'bg-orange-200 text-gray-800 border-gray-200';
    case 'unpaid':
    default:
      return 'bg-red-200 text-gray-800 border-gray-200';
  }
};

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
  const totalMinutes = (dayEndHour - dayStartHour) * 60;
  const days = Array.from({ length: 7 }, () => []);

  events.forEach((e) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const day = (start.getDay() + 6) % 7;
    const top =
      ((start.getHours() * 60 + start.getMinutes() - startMinutes) /
        totalMinutes) *
      100;
    const height = ((end - start) / 60000 / totalMinutes) * 100;
    days[day].push({ ...e, start, end, top, height });
  });

  days.forEach((list) => {
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

  return days;
}

const GridLayer = React.memo(({ hours, days }) => (
  <div className="grid-layer">
    <div className="days-grid">
      {/* Les lignes horizontales sont créées via CSS */}
    </div>
  </div>
));

const InteractiveLayer = React.memo(function InteractiveLayer({
  layout,
  tasks,
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
          {tasks
            .filter((task) => {
              const taskStart = new Date(task.start);
              const dayStart = new Date(day.date);
              dayStart.setHours(0, 0, 0, 0);
              const dayEnd = new Date(dayStart);
              dayEnd.setDate(dayEnd.getDate() + 1);
              return taskStart >= dayStart && taskStart < dayEnd;
            })
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
      {layout.map((dayEvents, dayIndex) => (
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
              className={`event${draggingId === e.id ? " dragging" : ""}`}
              style={{
                left: `${(e.col * 100) / e.colCount}%`,
                width: `${100 / e.colCount}%`,
                top: `${e.top}%`,
                height: `${e.height}%`,
                backgroundColor: e.color || "#3b82f6",
              }}
            >
              {e.description || e.title || "Événement"}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

export default function WeeklyGrid({
  events = [],
  tasks = [],
  onSlotSelect,
  onEventClick,
  weekStart = new Date(),
}) {
  const user = useFirebaseUser();

  const hours = useMemo(
    () =>
      Array.from(
        { length: 10 },
        (_, i) => `${String(9 + i).padStart(2, "0")}:00`
      ),
    []
  );
  const timeLabels = React.useMemo(() => [...hours, "18:00"], [hours]);

  const days = useMemo(() => {
    const start = new Date(weekStart);
    return DAY_NAMES.map((name, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { name, date: d };
    });
  }, [weekStart]);

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

  const layout = useMemo(
    () => placeEventsByDay(events, DAY_START, DAY_END),
    [events]
  );

  const wrapperRef = useRef(null);

  const containerHeight = useMemo(() => hours.length * SLOT_HEIGHT, [hours]);

  if (!user) {
    return <div>Chargement...</div>;
  }

  return (
    <div ref={wrapperRef} className="week-shell">
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
            layout={layout}
            tasks={tasks}
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
