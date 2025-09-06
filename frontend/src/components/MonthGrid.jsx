import React, { useState, useEffect, useMemo, useCallback } from 'react';
import '../styles/MonthCalendar.css';
import {
  saveEvent,
  watchEvents,
  watchTasks,
  getMonthRange,
  useFirebaseUser,
} from '../firebase';

function MonthGrid({ year, month, onDateSelect, onEventClick }) {
  const user = useFirebaseUser();
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [eventsByDay, setEventsByDay] = useState({});
  const [tasksByDay, setTasksByDay] = useState({});

  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
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

  const monthRange = useMemo(() => getMonthRange(year, month), [year, month]);

  // Watch events - seulement si user connecté
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setEventsByDay({});
      return;
    }

    const unsubscribe = watchEvents(monthRange, (newEvents) => {
      setEvents(newEvents);
      
      // Organiser les événements par jour
      const byDay = {};
      newEvents.forEach(event => {
        const eventDate = new Date(event.start);
        const dayKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
        
        if (!byDay[dayKey]) {
          byDay[dayKey] = [];
        }
        byDay[dayKey].push(event);
      });
      
      setEventsByDay(byDay);
    });

    return unsubscribe;
  }, [user, monthRange]);

  // Watch tasks - seulement si user connecté
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setTasksByDay({});
      return;
    }

    const unsubscribe = watchTasks(monthRange, (newTasks) => {
      setTasks(newTasks);
      
      // Organiser les tâches par jour
      const byDay = {};
      newTasks.forEach(task => {
        const taskDate = new Date(task.start);
        const dayKey = `${taskDate.getFullYear()}-${taskDate.getMonth()}-${taskDate.getDate()}`;
        
        if (!byDay[dayKey]) {
          byDay[dayKey] = [];
        }
        byDay[dayKey].push(task);
      });
      
      setTasksByDay(byDay);
    });

    return unsubscribe;
  }, [user, monthRange]);

  const createEvent = useCallback(async (date) => {
    if (!user) {
      console.warn('Utilisateur non connecté, création événement bloquée');
      return;
    }

    // Créer de vrais Date objects avec setHours
    const start = new Date(date);
    start.setHours(9, 0, 0, 0); // 09:00
    const end = new Date(date);
    end.setHours(10, 0, 0, 0); // 10:00

    const newEvent = {
      title: 'Nouvel événement',
      start,
      end,
      color: '#3b82f6',
      description: ''
    };

    // Optimistic UI
    const tempEvent = { ...newEvent, id: `temp_${Date.now()}` };
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    setEventsByDay(prev => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] || []), tempEvent]
    }));

    try {
      const savedEvent = await saveEvent(newEvent);
      // Remplacer l'événement temporaire par le vrai
      setEventsByDay(prev => ({
        ...prev,
        [dayKey]: (prev[dayKey] || []).map(e => e.id === tempEvent.id ? savedEvent : e)
      }));
    } catch (error) {
      console.error('Erreur lors de la création de l\'événement:', error);
      // Rollback optimistic UI
      setEventsByDay(prev => ({
        ...prev,
        [dayKey]: (prev[dayKey] || []).filter(e => e.id !== tempEvent.id)
      }));
    }
  }, [user]);

  const handleSelect = (value) => {
    if (!user) {
      console.warn('Utilisateur non connecté, sélection bloquée');
      return;
    }
    
    if (value) {
      const selectedDate = new Date(year, month, value);
      if (onDateSelect) {
        onDateSelect(selectedDate);
      } else {
        createEvent(selectedDate);
      }
    }
  };

  const handleAddEvent = (value) => {
    if (!user) {
      console.warn('Utilisateur non connecté, ajout événement bloqué');
      return;
    }
    
    const selectedDate = new Date(year, month, value);
    createEvent(selectedDate);
  };

  const getDayItems = (value) => {
    if (!value) return { events: [], tasks: [], total: 0 };
    
    const dayKey = `${year}-${month}-${value}`;
    const dayEvents = eventsByDay[dayKey] || [];
    const dayTasks = tasksByDay[dayKey] || [];
    
    return {
      events: dayEvents,
      tasks: dayTasks,
      total: dayEvents.length + dayTasks.length
    };
  };

  const renderDayItems = (items, maxVisible = 3) => {
    const { events, tasks, total } = items;
    const allItems = [...events, ...tasks].slice(0, maxVisible);
    const remaining = Math.max(0, total - maxVisible);

    return (
      <>
        {allItems.map((item, index) => (
          <div
            key={item.id}
            className={`month-item ${item.icon ? 'month-task' : 'month-event'}${
              item.status ? ` status-${item.status}` : ''
            }`}
            style={item.color ? { '--chip-color': item.color } : undefined}
            onClick={(evt) => {
              evt.stopPropagation();
              onEventClick && onEventClick(item);
            }}
            title={item.title}
          >
            {item.icon && <span className="month-item-icon">{item.icon}</span>}
            <span className="month-item-title">
              {item.title?.length > 12 ? `${item.title.substring(0, 12)}...` : item.title}
            </span>
          </div>
        ))}
        {remaining > 0 && (
          <div className="month-item-more">
            +{remaining}
          </div>
        )}
      </>
    );
  };

  const isSpanningEvent = (event, currentDay) => {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const dayStart = new Date(year, month, currentDay);
    const dayEnd = new Date(year, month, currentDay + 1);
    
    return eventStart < dayStart || eventEnd > dayEnd;
  };

  return (
    <div className="month-calendar">
      <div className="month-day-header">
        {daysOfWeek.map((day) => (
          <div key={day} className="calendar-header-cell">
            {day}
          </div>
        ))}
      </div>
      <div className="month-grid border rounded-md overflow-hidden">
        {rows.map((week, wi) => (
          <div key={wi} className="calendar-row">
            {week.map((value, di) => (
              value ? (
                <div key={di} className="calendar-cell">
                  <div className="calendar-cell-header">
                    <span className="calendar-cell-day">{value}</span>
                    <button
                      className="calendar-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddEvent(value);
                      }}
                      title="Ajouter un événement"
                    >
                      +
                    </button>
                  </div>
                  
                  <div 
                    className="calendar-cell-content"
                    onClick={() => handleSelect(value)}
                  >
                    {renderDayItems(getDayItems(value))}
                  </div>
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

export default MonthGrid;