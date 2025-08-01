import React from 'react';
import normalizeEvent from '../utils/normalizeEvent';

const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const HOURS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

export default function WeeklyGrid({ events = [] }) {
  const normalized = events.map(normalizeEvent);
  return (
    <div className="weekly-grid">
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
            <div key={day} style={{ flex: 1, borderTop: '1px solid #ddd', borderLeft: '1px solid #ddd', minHeight: '40px', position: 'relative' }}>
              {normalized
                .filter((e) => e.dayFr === day && e.startTimeFormatted === time)
                .map((e) => (
                  <div key={e.id} style={{ padding: '2px', background: '#bfdbfe', margin: '1px', borderRadius: '2px', fontSize: '12px' }}>
                    {e.description || e.title || 'Événement'}
                  </div>
                ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
