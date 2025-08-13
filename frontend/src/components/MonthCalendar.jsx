import React from 'react';
import '../styles/MonthCalendar.css';


function MonthCalendar({ year, month, events = [], onDateSelect }) {

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

  const activate = (el) => {
    el.classList.add('cell--active');
    console.log('click OK');
    setTimeout(() => el.classList.remove('cell--active'), 200);
  };

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

                  <div
                    key={di}
                    className="calendar-cell"
                    tabIndex="0"
                    onClick={(e) => {
                      activate(e.currentTarget);
                      onDateSelect && onDateSelect(new Date(year, month, value));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        activate(e.currentTarget);
                        onDateSelect && onDateSelect(new Date(year, month, value));
                        e.preventDefault();
                      }
                    }}
                  >

                  <div key={di} className="calendar-cell">

                    <div>{value}</div>
                    {events
                      .filter(
                        (e) =>
                          e.start.getFullYear() === year &&
                          e.start.getMonth() === month &&
                          e.start.getDate() === value,
                      )
                      .map((e) => (
                        <div key={e.id} className="month-event">
                          {e.description || e.title || 'Événement'}
                        </div>
                      ))}
                  </div>
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
