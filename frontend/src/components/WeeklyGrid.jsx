import React, { useRef, useEffect } from 'react';
import normalizeEvent from '../utils/normalizeEvent';
import '../styles/WeeklyGrid.css';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

export default function WeeklyGrid({ events = [] }) {
  const layerRef = useRef(null);
  const normalized = events.map(normalizeEvent);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    let dragging = false;

    const activate = (cell) => {
      cell.classList.add('cell--active');
      console.log('click OK');
      setTimeout(() => cell.classList.remove('cell--active'), 200);
    };

    const onPointerDown = (e) => {
      const cell = e.target.closest('.wg-cell');
      if (!cell) return;
      dragging = true;
      activate(cell);
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const cell = e.target.closest('.wg-cell');
      if (cell) activate(cell);
    };

    const endDrag = () => {
      dragging = false;
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const cell = e.target.closest('.wg-cell');
        if (cell) {
          activate(cell);
          e.preventDefault();
        }
      }
    };

    layer.addEventListener('pointerdown', onPointerDown, { passive: false });
    layer.addEventListener('pointermove', onPointerMove, { passive: false });
    layer.addEventListener('pointerup', endDrag);
    layer.addEventListener('pointerleave', endDrag);
    layer.addEventListener('keydown', onKeyDown);

    return () => {
      layer.removeEventListener('pointerdown', onPointerDown);
      layer.removeEventListener('pointermove', onPointerMove);
      layer.removeEventListener('pointerup', endDrag);
      layer.removeEventListener('pointerleave', endDrag);
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
              >
                {normalized
                  .filter((e) => e.dayFr === day && e.startTimeFormatted === time)
                  .map((e) => (
                    <div
                      key={e.id}
                      style={{
                        padding: '2px',
                        background: '#bfdbfe',
                        margin: '1px',
                        borderRadius: '2px',
                        fontSize: '12px',
                      }}
                    >
                      {e.description || e.title || 'Événement'}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="interactive-layer" ref={layerRef}>
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
