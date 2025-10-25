import React, { useMemo } from 'react';
import '../styles/MonthCalendar.css';
import { useSettings } from '../context/SettingsContext';

function MonthCalendar({ year, month, events = [], onDateSelect, onEventClick }) {
  const { settings, loading } = useSettings();
  const showWeekendsEnabled = useMemo(() => {
    if (loading || !settings) {
      return true;
    }
    return settings.showWeekends === true;
  }, [loading, settings]);
  const daysOfWeek = useMemo(
    () => ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
    []
  );
  const visibleDaysOfWeek = useMemo(
    () => (showWeekendsEnabled ? daysOfWeek : daysOfWeek.slice(0, 5)),
    [daysOfWeek, showWeekendsEnabled]
  );
  const columnCount = showWeekendsEnabled ? 7 : 5;
  const monthGridStyle = useMemo(
    () => ({
      '--month-grid-day-count': String(columnCount),
    }),
    [columnCount]
  );
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7; // Monday = 0
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

  const handleSelect = (value) => {
    if (onDateSelect && value) {
      onDateSelect(new Date(year, month, value));
    }
  };

    return (
      <div className="month-calendar" style={monthGridStyle}>
        <div className="month-day-header">
          {visibleDaysOfWeek.map((day) => (
            <div key={day} className="calendar-header-cell">
              {day}
            </div>
          ))}
        </div>
        <div className="month-grid border rounded-md overflow-hidden">
          {rows.map((week, wi) => (
            <div key={wi} className="calendar-row">
              {week.map((value, di) => {
                if (!showWeekendsEnabled && di >= 5) {
                  return null;
                }
                return value ? (
                  <button
                  key={di}
                  type="button"
                  className="calendar-cell"
                  onClick={() => handleSelect(value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(value);
                    }
                  }}
                >
                  <div>{value}</div>
                    {events
                      .filter(
                        (e) =>
                          e.start.getFullYear() === year &&
                          e.start.getMonth() === month &&
                          e.start.getDate() === value,
                      )
                      .map((e) => (
                        <div
                          key={e.id}
                          className="month-event"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            onEventClick && onEventClick(e);
                          }}
                        >
                          {e.description || e.title || 'Événement'}
                        </div>
                      ))}
                  </button>
                ) : (
                  <div key={di} className="calendar-cell empty" />
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MonthCalendar;
