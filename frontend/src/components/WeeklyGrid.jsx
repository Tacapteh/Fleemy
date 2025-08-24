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

const GridCell = React.memo(() => <div className="cell" />);

const GridRow = React.memo(({ time, first, days }) => (
  <div className="grid-row">
    <div ref={first} className="time-col hour-label">
      {time}
    </div>
    {days.map((d) => (
      <GridCell key={d.name} />
    ))}
  </div>
));

const InteractiveCell = React.memo(({ onClick }) => (
  <button type="button" className="wg-cell" onClick={onClick} />
));

const InteractiveRow = React.memo(({ time, days, onCellClick }) => (
  <div className="row">
    <div className="time-col hour-placeholder" />
    {days.map((d) => (
      <InteractiveCell key={d.name} onClick={() => onCellClick(d.date, time)} />
    ))}
  </div>
));

const GridLayer = React.memo(({ hours, days, timeColRef }) => (
  <div className="grid-layer">
    {hours.map((time, idx) => (
      <GridRow key={time} time={time} first={idx === 0 ? timeColRef : null} days={days} />
    ))}
  </div>
));

const InteractiveLayer = React.memo(function InteractiveLayer({
  layout,
  hours,
  days,
  onCellClick,
}) {
  const [draggingId, setDraggingId] = React.useState(null);
  return (
    <div className="interactive-layer">
      {layout.map((dayEvents, di) => (
        <div
          key={di}
          className="events-col"
          style={{
            left: `calc(var(--time-col-width) + ${di} * ((100% - var(--time-col-width)) / ${days.length}))`,
            width: `calc((100% - var(--time-col-width)) / ${days.length})`,
          }}
        >
          {dayEvents.map((e) => (
            <div
              key={e.id}
              draggable
              onDragStart={() => setDraggingId(e.id)}
              onDragEnd={() => setDraggingId(null)}
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
      {hours.map((time) => (
        <InteractiveRow
          key={time}
          time={time}
          days={days}
          onCellClick={onCellClick}
        />
      ))}
    </div>
  );
});

export default function WeeklyGrid({ events = [], onSlotSelect, weekStart = new Date() }) {
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
  const timeColRef = React.useRef(null);

  React.useLayoutEffect(() => {
    const updateWidth = () => {
      const width = timeColRef.current?.offsetWidth || 0;
      if (wrapperRef.current) {
        wrapperRef.current.style.setProperty("--time-col-width", `${width}px`);
      }
    };
    updateWidth();
    const handleResize = () => {
      clearTimeout(handleResize.t);
      handleResize.t = setTimeout(updateWidth, 50);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(handleResize.t);
    };
  }, []);

  const containerHeight = React.useMemo(
    () => hours.length * SLOT_HEIGHT,
    [hours],
  );

  return (
    <div ref={wrapperRef} className="week-shell">
      <div className="week-day-header">
        <div className="time-col" />
        {days.map((d) => (
          <div key={d.name} className="day-col">
            {d.name} {d.date.getDate()}
          </div>
        ))}
      </div>

      <div
        className="week-grid-body rounded-md overflow-hidden"
        style={{ height: containerHeight, "--slot-height": `${SLOT_HEIGHT}px` }}
      >
        <GridLayer hours={hours} days={days} timeColRef={timeColRef} />
        <InteractiveLayer
          layout={layout}
          hours={hours}
          days={days}
          onCellClick={onCellClick}
        />
      </div>
    </div>
  );
}
