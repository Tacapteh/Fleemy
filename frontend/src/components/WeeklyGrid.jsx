import React from 'react';
import normalizeEvent from '../utils/normalizeEvent';
import '../styles/WeeklyGrid.css';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

function placeEventsByDay(events, dayStartHour = 9, dayEndHour = 18) {
  const startMinutes = dayStartHour * 60;
  const totalMinutes = (dayEndHour - dayStartHour) * 60;
  const days = Array.from({ length: 7 }, () => []);

  events.forEach((e) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const day = (start.getDay() + 6) % 7; // Monday = 0
    const top = ((start.getHours() * 60 + start.getMinutes() - startMinutes) / totalMinutes) * 100;
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

export default function WeeklyGrid({ events = [], onSlotSelect }) {
  const normalized = events.map(normalizeEvent);
  const layout = placeEventsByDay(normalized, 9, 18);
  const wrapperRef = React.useRef(null);
  const timeColRef = React.useRef(null);

  React.useLayoutEffect(() => {
    const updateWidth = () => {
      const width = timeColRef.current?.offsetWidth || 0;
      if (wrapperRef.current) {
        wrapperRef.current.style.setProperty('--time-col-width', `${width}px`);
      }
    };
    updateWidth();
    let t;
    const handleResize = () => {
      clearTimeout(t);
      t = setTimeout(updateWidth, 50);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(t);
    };
  }, []);

  const handleSelect = (day, time) => {
    if (onSlotSelect) {
      onSlotSelect(day, time);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="weekly-grid border rounded-md overflow-hidden"
      style={{ '--col-count': DAYS.length }}
    >
      <div className="week-day-header">
        <div className="time-col" />
        {DAYS.map((d) => (
          <div key={d} className="day-col">
            {d}
          </div>
        ))}
      </div>

      <div className="week-grid-body">
        <div className="grid-layer">
          {HOURS.map((time, idx) => (
            <div key={time} className="grid-row">
              <div
                ref={idx === 0 ? timeColRef : null}
                className="time-col hour-label"
              >
                {time}
              </div>
              {DAYS.map((day) => (
                <div key={day} className="cell" />
              ))}
            </div>
          ))}
        </div>

        <div className="interactive-layer">
          {layout.map((dayEvents, di) => (
            <div
              key={di}
              className="events-col"
              style={{
                left: `calc(var(--time-col-width) + ${di} * ((100% - var(--time-col-width)) / ${DAYS.length}))`,
                width: `calc((100% - var(--time-col-width)) / ${DAYS.length})`,
              }}
            >
              {dayEvents.map((e) => (
                <div
                  key={e.id}
                  className="event"
                  style={{
                    left: `${(e.col * 100) / e.colCount}%`,
                    width: `${100 / e.colCount}%`,
                    top: `${e.top}%`,
                    height: `${e.height}%`,
                  }}
                >
                  {e.description || e.title || 'Événement'}
                </div>
              ))}
            </div>
          ))}
          {HOURS.map((time) => (
            <div key={time} className="row">
              <div className="time-col hour-placeholder" />
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className="wg-cell"
                  onClick={() => handleSelect(day, time)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(day, time);
                    }
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
