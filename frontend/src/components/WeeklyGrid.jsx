import React from "react";
import "../styles/WeeklyGrid.css";

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
const DAY_END = 18; // exclusive
const SLOT_HEIGHT = 64;

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
      {/* Les lignes horizontales sont créées via CSS repeating-linear-gradient */}
    </div>
  </div>
));

const InteractiveLayer = React.memo(function InteractiveLayer({
  layout,
  hours,
  days,
  onCellClick,
  onEventClick,
}) {
  const [draggingId, setDraggingId] = React.useState(null);
  return (
    <div className="interactive-layer">
      {/* Zones cliquables pour chaque jour et chaque heure */}
      {days.map((day, dayIndex) => (
        <div key={dayIndex} className="day-column" style={{ gridColumn: dayIndex + 1 }}>
          {hours.map((time, hourIndex) => (
            <button
              key={time}
              type="button"
              className="time-slot-button"
              style={{ gridRow: hourIndex + 1 }}
              onClick={() => onCellClick(day.date, time)}
            />
          ))}
        </div>
      ))}
      
      {/* Événements positionnés au-dessus */}
      {layout.map((dayEvents, dayIndex) => (
        <div key={dayIndex} className="events-container" style={{ gridColumn: dayIndex + 1 }}>
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

export default function WeeklyGrid({ events = [], onSlotSelect, onEventClick, weekStart = new Date() }) {
  const hours = React.useMemo(
    () => Array.from({ length: 9 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`),
    [],
  );

  const days = React.useMemo(() => {
    const start = new Date(weekStart);
    return DAY_NAMES.map((name, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { name, date: d };
    });
  }, [weekStart]);

  const onCellClick = React.useCallback(
    (date, time) => {
      if (!onSlotSelect) return;
      const [h, m] = time.split(":").map(Number);
      const start = new Date(date);
      start.setHours(h, m, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);
      onSlotSelect(start, end);
    },
    [onSlotSelect],
  );

  const layout = React.useMemo(
    () => placeEventsByDay(events, DAY_START, DAY_END),
    [events],
  );

  const wrapperRef = React.useRef(null);

  const containerHeight = React.useMemo(
    () => hours.length * SLOT_HEIGHT,
    [hours],
  );

  return (
    <div ref={wrapperRef} className="week-shell">
      <div className="week-day-header">
        <div className="time-gutter-header"></div>
        {days.map((d) => (
          <div key={d.name} className="day-header">
            {d.name} {d.date.getDate()}
          </div>
        ))}
      </div>

      <div className="week-grid-container">
        {/* Gouttière des heures - séparée et stickée */}
        <div className="time-gutter">
          {hours.map((time, index) => (
            <div
              key={time}
              className="time-label"
              style={{ top: `calc(${index} * var(--row-h))` }}
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
            "--slot-height": `${SLOT_HEIGHT}px`,
            "--row-h": `${SLOT_HEIGHT}px`
          }}
        >
          <GridLayer hours={hours} days={days} />
          <InteractiveLayer
            layout={layout}
            hours={hours}
            days={days}
            onCellClick={onCellClick}
            onEventClick={onEventClick}
          />
        </div>
      </div>
    </div>
  );
}
