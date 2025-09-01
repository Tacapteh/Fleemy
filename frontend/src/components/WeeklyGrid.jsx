import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import "../styles/WeeklyGrid.css";
import { useFirebaseUser } from "../firebase";

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
            return (
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
                  top: `${top}%`,
                  height: `${height}%`,
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
            );
          })}
        </div>
      ))}
    </div>
  );
});

export default function WeeklyGrid(props) {
  const events = Array.isArray(props.events) ? props.events : [];
  const tasks = Array.isArray(props.tasks) ? props.tasks : [];
  const weekStart =
    props.weekStart && typeof props.weekStart.toDate === "function"
      ? props.weekStart.toDate()
      : props.weekStart instanceof Date
      ? props.weekStart
      : new Date(props.weekStart);
  const { onSlotSelect, onEventClick } = props;
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

  const ws = new Date(weekStart);
  ws.setHours(0, 0, 0, 0);
  events.forEach((e) => {
    const d = new Date(`${e.date}T00:00:00`);
    const idx = Math.floor((d - ws) / (24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < 7) {
      const top = Math.max(0, minutesFromHM(e.start));
      const dur = Math.max(15, minutesFromHM(e.end) - top);
      columns[idx].push({
        ...e,
        _topMin: top,
        _durMin: dur,
      });
    }
  });

  tasks.forEach(t => {
    const idx = dayIndexFrom(t.date || t.day || t.startDate || t.start, weekStart);
    if (idx >= 0 && idx < 7) {
      const top = Math.max(0, minutesFromHM(t.start));
      const dur = Math.max(15, minutesFromHM(t.end) - top);
      taskColumns[idx].push({
        ...t,
        start: toHM(t.start),
        end: toHM(t.end),
        _topMin: top,
        _durMin: dur,
      });
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
          />
        </div>
      </div>
    </div>
  );
}
