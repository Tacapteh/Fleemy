import React from 'react';
import '../styles/MonthCalendar.css';

function MonthCalendar({ year, month }) {
  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7; // adjust so Monday=0
  const cells = [];

  for (let i = 0; i < offset; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  while (cells.length < 42) {
    cells.push(null);
  }

  const rows = [];
  for (let i = 0; i < 6; i++) {
    rows.push(cells.slice(i * 7, i * 7 + 7));
  }

  return (
    <div className="month-calendar">
      <div className="calendar-header">
        {daysOfWeek.map((day) => (
          <div key={day} className="calendar-header-cell">
            {day}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {rows.map((week, wi) => (
          <div key={wi} className="calendar-row">
            {week.map((value, di) => (
              value ? (
                <div key={di} className="calendar-cell">{value}</div>
              ) : (
                <div key={di} className="calendar-cell empty" />
              )
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MonthCalendar;
