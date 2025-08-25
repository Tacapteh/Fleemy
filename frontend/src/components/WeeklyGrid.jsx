import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "../styles/WeeklyGrid.css";
import { saveEvent, watchEvents, watchTasks, getWeekRange } from '../firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';

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
const DAY_END = 19; // exclusive (pour inclure 18h00)
const SLOT_HEIGHT = 64;

function placeEventsByDay(events, dayStartHour = 9, dayEndHour = 19) {
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
      {/* Les lignes horizontales sont créées via CSS */}
    </div>
  </div>
));

const InteractiveLayer = React.memo(function InteractiveLayer({
  layout,
  tasks,
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
        <div key={dayIndex} className="day-column" style={{ gridColumn: dayIndex + 1, gridRow: '1 / -1' }}>
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
          {tasks.filter(task => {
            const taskStart = new Date(task.start);
            const dayStart = new Date(day.date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);
            return taskStart >= dayStart && taskStart < dayEnd;
          }).map((task) => {
            const taskStart = new Date(task.start);
            const hourIndex = taskStart.getHours() - DAY_START;
            
            if (hourIndex < 0 || hourIndex >= hours.length) return null;

            return (
              <div
                key={task.id}
                className="task-indicator"
                style={{ 
                  gridRow: hourIndex + 1,
                  backgroundColor: task.color || '#10b981'
                }}
                title={task.title}
              >
                <span className="task-icon">{task.icon || '📋'}</span>
              </div>
            );
          })}
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
                backgroundColor: e.color || '#3b82f6'
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

export default function WeeklyGrid({ onSlotSelect, onEventClick, weekStart = new Date() }) {
  const [user] = useAuthState(auth);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  
  const hours = useMemo(
    () => Array.from({ length: 10 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`),
    [],
  );

  const days = useMemo(() => {
    const start = new Date(weekStart);
    return DAY_NAMES.map((name, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { name, date: d };
    });
  }, [weekStart]);

  const weekRange = useMemo(() => getWeekRange(weekStart), [weekStart]);

  // Watch events - seulement si user connecté
  useEffect(() => {
    if (!user) {
      setEvents([]);
      return;
    }

    const unsubscribe = watchEvents(weekRange, (newEvents) => {
      setEvents(newEvents);
    });

    return unsubscribe;
  }, [user, weekRange]);

  // Watch tasks - seulement si user connecté  
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const unsubscribe = watchTasks(weekRange, (newTasks) => {
      setTasks(newTasks);
    });

    return unsubscribe;
  }, [user, weekRange]);

  const createEvent = useCallback(async (date, timeString) => {
    if (!user) {
      console.warn('Utilisateur non connecté, création événement bloquée');
      return;
    }

    // Corriger le bug getHours : reconstruire un Date avec setHours
    const [hours, minutes] = timeString.split(':').map(Number);
    const start = new Date(date);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);

    const newEvent = {
      title: 'Nouvel événement',
      start,
      end,
      color: '#3b82f6',
      description: ''
    };

    // Optimistic UI
    const tempEvent = { ...newEvent, id: `temp_${Date.now()}` };
    setEvents(prev => [...prev, tempEvent]);

    try {
      const savedEvent = await saveEvent(newEvent);
      // Remplacer l'événement temporaire par le vrai
      setEvents(prev => prev.map(e => e.id === tempEvent.id ? savedEvent : e));
    } catch (error) {
      console.error('Erreur lors de la création de l\'événement:', error);
      // Rollback optimistic UI
      setEvents(prev => prev.filter(e => e.id !== tempEvent.id));
    }
  }, [user]);

  const onCellClick = useCallback(
    (date, time) => {
      if (onSlotSelect) {
        onSlotSelect(date, time);
      } else {
        createEvent(date, time);
      }
    },
    [onSlotSelect, createEvent],
  );

  const onAddEvent = useCallback(
    (date, time) => {
      createEvent(date, time);
    },
    [createEvent],
  );

  const layout = useMemo(
    () => placeEventsByDay(events, DAY_START, DAY_END),
    [events],
  );

  const wrapperRef = useRef(null);

  const containerHeight = useMemo(
    () => hours.length * SLOT_HEIGHT,
    [hours],
  );

  return (
    <div ref={wrapperRef} className="week-shell">
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
          {hours.map((time, index) => (
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
            "--weekly-grid-row-h": `${SLOT_HEIGHT}px`
          }}
        >
          <GridLayer hours={hours} days={days} />
          <InteractiveLayer
            layout={layout}
            tasks={tasks}
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