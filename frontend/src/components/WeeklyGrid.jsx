import React, { useRef, useEffect } from 'react';
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
  const layerRef = useRef(null);
  const normalized = events.map(normalizeEvent);
  const layout = placeEventsByDay(normalized, 9, 18);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    let dragging = false;

    const rows = HOURS.length;
    const cols = DAYS.length;

    const getCell = (clientX, clientY) => {
      const rect = layer.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top + layer.scrollTop;
      const colWidth = rect.width / cols;
      const rowHeight = rect.height / rows;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(x / colWidth)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(y / rowHeight)));
      return layer.querySelector(
        `.wg-cell[data-day="${DAYS[col]}"][data-hour="${HOURS[row]}"]`
      );
    };

    const activate = (cell) => {
      cell.classList.add('cell--active');
      console.log('click OK');
      setTimeout(() => cell.classList.remove('cell--active'), 200);
    };

    const onPointerDown = (e) => {
      dragging = true;
      layer.setPointerCapture(e.pointerId);
      const cell = getCell(e.clientX, e.clientY);
      if (cell) activate(cell);
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const cell = getCell(e.clientX, e.clientY);
      if (cell) activate(cell);
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      const cell = getCell(e.clientX, e.clientY);
      if (cell) {
        activate(cell);
        if (onSlotSelect) {
          onSlotSelect(cell.dataset.day, cell.dataset.hour);
        }
      }
      layer.releasePointerCapture(e.pointerId);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const cell = e.target.closest('.wg-cell');
        if (cell) {
          activate(cell);
          if (onSlotSelect) {
            onSlotSelect(cell.dataset.day, cell.dataset.hour);
          }
          e.preventDefault();
        }
      }
    };

    layer.addEventListener('pointerdown', onPointerDown, { passive: false });
    layer.addEventListener('pointermove', onPointerMove, { passive: false });
    layer.addEventListener('pointerup', onPointerUp);
    layer.addEventListener('pointercancel', onPointerUp);
    layer.addEventListener('pointerleave', onPointerUp);
    layer.addEventListener('keydown', onKeyDown);

    return () => {
      layer.removeEventListener('pointerdown', onPointerDown);
      layer.removeEventListener('pointermove', onPointerMove);
      layer.removeEventListener('pointerup', onPointerUp);
      layer.removeEventListener('pointercancel', onPointerUp);
      layer.removeEventListener('pointerleave', onPointerUp);
      layer.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="weekly-grid">
      <div className="grid-layer">
        <div className="grid-header" style={{ display: 'flex' }}>
          <div style={{ width: '60px' }}></div>
          {DAYS.map((d) => (
            <div key={d} style={{ flex: 1, textAlign: 'center', fontWeight: 'bold' }}>{d}</div>
          ))}
        </div>
        {HOURS.map((time) => (
          <div key={time} style={{ display: 'flex' }}>
            <div style={{ width: '60px', borderTop: '1px solid #ddd' }}>{time}</div>
            {DAYS.map((day) => (
              <div
                key={day}
                style={{
                  flex: 1,
                  borderTop: '1px solid #ddd',
                  borderLeft: '1px solid #ddd',
                  minHeight: '40px',
                  position: 'relative',
                }}
              ></div>
            ))}
          </div>
        ))}
      </div>
      <div className="interactive-layer" ref={layerRef}>
        {layout.map((dayEvents, di) => (
          <div
            key={di}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(di * 100) / DAYS.length}%`,
              width: `${100 / DAYS.length}%`,
            }}
          >
            {dayEvents.map((e) => (
              <div
                key={e.id}
                style={{
                  position: 'absolute',
                  left: `${(e.col * 100) / e.colCount}%`,
                  width: `${100 / e.colCount}%`,
                  top: `${e.top}%`,
                  height: `${e.height}%`,
                  background: '#bfdbfe',
                  borderRadius: '2px',
                  fontSize: '12px',
                  overflow: 'hidden',
                  padding: '2px',
                }}
              >
                {e.description || e.title || 'Événement'}
              </div>
            ))}
          </div>
        ))}
        {HOURS.map((time) => (
          <div key={time} className="row">
            <div className="hour-placeholder"></div>
            {DAYS.map((day) => (
              <div
                key={day}
                className="wg-cell"
                data-day={day}
                data-hour={time}
                tabIndex="0"
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
