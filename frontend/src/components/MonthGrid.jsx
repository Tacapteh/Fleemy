import React, { useState, useEffect, useMemo } from 'react';
import '../styles/MonthCalendar.css';
import {
  watchPlanningEventsInRange,
  watchTasks,
  getMonthRange,
  useFirebaseUser,
} from '../firebase';
function MonthGrid({ year, month, onDateSelect, onEventClick, onCreateEvent, context }) {
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
  const contextKey = useMemo(() => {
    if (!context) {
      return 'none';
    }
    if (context.type === 'team') {
      return `team:${context.teamId || ''}:${context.memberUid || ''}`;
    }
    return `personal:${context.userId || ''}`;
  }, [context?.type, context?.teamId, context?.memberUid, context?.userId]);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setEventsByDay({});
      return;
    }

    if (!monthRange?.from || !monthRange?.to) {
      setEvents([]);
      setEventsByDay({});
      return;
    }

    if (context && context.type === 'team' && !context.memberUid) {
      setEvents([]);
      setEventsByDay({});
      return;
    }

    const unsubscribe = watchPlanningEventsInRange(context, monthRange, (newEvents) => {
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
  }, [user, monthRange, contextKey, context]);

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

  const handleSelect = (value) => {
    if (!user) {
      console.warn('Utilisateur non connecté, sélection bloquée');
      return;
    }

    if (value) {
      const selectedDate = new Date(year, month, value);
      const wantsEvent = window.confirm('Créer un événement ?\nAnnuler pour accéder à la semaine');
      if (wantsEvent) {
        onCreateEvent && onCreateEvent(selectedDate);
      } else if (onDateSelect) {
        onDateSelect(selectedDate);
      }
    }
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
        {allItems.map((item) => {
          const isTask = !!item.icon;
          const type = item.status || item.type;
          const statusClass = !isTask && ['paid', 'unpaid', 'pending'].includes(type)
            ? `status-${type}`
            : '';
          const style = isTask
            ? { '--item-color': item.color || '#10b981' }
            : !statusClass && item.color
            ? { '--item-color': item.color }
            : undefined;
          const label = item.client || item.title;
          return (
            <div
              key={item.id}
              className={`month-item ${isTask ? 'month-task' : ''} ${statusClass}`.trim()}
              style={style}
              onClick={(evt) => {
                evt.stopPropagation();
                onEventClick && onEventClick(item);
              }}
              title={label}
            >
              {isTask && <span className="month-item-icon">{item.icon}</span>}
              <span className="month-item-title">
                {label?.length > 12 ? `${label.substring(0, 12)}...` : label}
              </span>
            </div>
          );
        })}
        {remaining > 0 && (
          <div className="month-item-more">+{remaining}</div>
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
                <div
                  key={di}
                  className="calendar-cell"
                  onClick={() => handleSelect(value)}
                >
                  <div className="calendar-cell-header">
                    <span className="calendar-cell-day">{value}</span>
                  </div>

                  <div className="calendar-cell-content">
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