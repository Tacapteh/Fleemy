import { useState, useEffect, useMemo, useReducer } from 'react';
import WeeklyGrid from '../components/WeeklyGrid';
import MonthGrid from '../components/MonthGrid';
import WeekNavigationHeader from '../components/WeekNavigationHeader';

import EventModal from '../components/EventModal';

import useTeam from '../hooks/useTeam';
import {
  useFirebaseUser,
  watchEvents,
  watchTasks,
  saveEvent,
  deleteEvent,
  saveEventNew,
  deleteEventNew,
  watchWeekEvents,
  setTeamContext,
} from '../firebase';
import { showToast } from '../utils/toast';

export default function Planning() {
  const user = useFirebaseUser();
  const { team } = useTeam();
  const teamId = team?.id;
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const initialState = { loading: false, error: null, events: [] };
  function reducer(state, action) {
    switch (action.type) {
      case 'loading':
        return { ...state, loading: true, error: null };
      case 'events':
        return { ...state, events: action.events };
      case 'error':
        return { ...state, error: action.error, events: [] };
      case 'done':
        return { ...state, loading: false };
      case 'add':
        return { ...state, events: [...state.events, action.event] };
      case 'remove':
        return {
          ...state,
          events: state.events.filter((e) => e.id !== action.id),
        };
      default:
        return state;
    }
  }
  const [state, dispatch] = useReducer(reducer, initialState);

  const [showSkeleton, setShowSkeleton] = useState(true);
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(t);
  }, []);

  const [modal, setModal] = useState({ open: false, timeSlot: null, selectedDate: null, event: null });



  const startOfWeek = (d) => {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const weekLabel = (d) => {
    const start = startOfWeek(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startStr = start.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    });
    const endStr = end.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `Semaine du ${startStr} au ${endStr}`;
  };

  const monthLabel = (d) =>
    d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const onPrev = () =>
    setCurrentDate((d) =>
      view === 'week'
        ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7)
        : new Date(d.getFullYear(), d.getMonth() - 1, 1),
    );
  const onNext = () =>
    setCurrentDate((d) =>
      view === 'week'
        ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
        : new Date(d.getFullYear(), d.getMonth() + 1, 1),
    );
  const onToday = () => setCurrentDate(new Date());

  const currentLabel =
    view === 'week' ? weekLabel(currentDate) : monthLabel(currentDate);

  const weekStart = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    return end;
  }, [weekStart]);
  
  const weekRange = useMemo(() => {
    const from = new Date(weekStart);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [weekStart]);

  useEffect(() => {
    if (!user) {
      setTeamContext(null);
      dispatch({ type: 'events', events: [] });
      setTasks([]);
      return () => {};
    }

    setTeamContext(teamId || null);
    
    // Utiliser les nouvelles fonctions Firebase pour une meilleure gestion
    const weekStartISO = weekStart.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekEndISO = weekEnd.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Nouvelle approche : utiliser watchWeekEvents pour la déduplication et le tri automatique
    const unsubEvents = watchWeekEvents(
      user.uid, 
      weekStartISO, 
      weekEndISO,
      (events) => {
        dispatch({ type: 'events', events });
        dispatch({ type: 'done' });
      },
      (error) => {
        console.error('Erreur watchWeekEvents:', error);
        dispatch({ type: 'error', error: error.message });
      }
    );

    // Garder l'ancien système pour les tâches pour l'instant
    let { from, to } = weekRange || {};
    if (!from || !to) return () => {};

    if (typeof from === 'string') from = new Date(from);
    if (typeof to === 'string') to = new Date(to);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return () => {};

    const unsubTasks = watchTasks({ from, to }, (tsks) => {
      setTasks(tsks);
    });

    return () => {
      unsubEvents && unsubEvents();
      unsubTasks && unsubTasks();
    };
  }, [user?.uid, teamId, weekStart, weekEnd, weekRange]);
  const weekEvents = state.events;
  const monthEvents = state.events;

  const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const openSlot = (start) => {
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    const dayIndex = (start.getDay() + 6) % 7;
    const format = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setModal({
      open: true,
      timeSlot: { day: dayIndex, start: format(start), end: format(end) },
      selectedDate: start,
      event: null,
    });
  };

  const openDate = (date) => {
    setModal({ open: true, selectedDate: date, timeSlot: null, event: null });
  };

  const openEvent = (event) => {
    setModal({ open: true, event, timeSlot: null, selectedDate: null });
  };

  const closeModal = () => setModal({ open: false, timeSlot: null, selectedDate: null, event: null });

  const handleSaveEvent = async (data) => {
    if (!user) return;
    try {
      const dayIndex = data.day;
      const startDate = new Date(weekStart);
      startDate.setDate(weekStart.getDate() + dayIndex);
      const [sh, sm] = data.start.split(':').map(Number);
      startDate.setHours(sh, sm, 0, 0);
      const endDate = new Date(weekStart);
      endDate.setDate(weekStart.getDate() + dayIndex);
      const [eh, em] = data.end.split(':').map(Number);
      endDate.setHours(eh, em, 0, 0);

      const { from, to } = weekRange;
      if (startDate < from || endDate > to) {
        console.warn('Event en dehors de la plage, création annulée');
        return;
      }

      // Utiliser la nouvelle structure avec saveEventNew
      const dateISO = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const duration = Math.round((endDate - startDate) / (1000 * 60)); // minutes

      const eventData = {
        id: data.id, // si c'est un update, sinon sera généré
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        client: data.client_name || data.description || '',
        status: data.status || data.type || 'unpaid', // défaut unpaid
        hourly_rate: data.hourly_rate || 50,
        duration: duration,
        task_id: data.task_id || null,
        // Champs additionnels pour compatibilité
        description: data.description || '',
        client_id: data.client_id || '',
        client_name: data.client_name || '',
        day: DAY_KEYS[dayIndex] || 'monday',
        owner_id: user.uid,
        user_id: user.uid,
        team_id: teamId || null,
      };

      await saveEventNew(user.uid, dateISO, eventData);
      showToast('Événement sauvegardé avec succès');

    } catch (e) {
      console.error('save event', e);
      showToast('Erreur lors de la sauvegarde', true);
    } finally {
      closeModal();
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!user) return;
    try {
      // Trouver l'event pour obtenir sa date
      const event = state.events.find(e => e.id === id);
      if (!event) {
        console.error('Event non trouvé pour suppression:', id);
        return;
      }

      const eventDate = new Date(event.start);
      const dateISO = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      await deleteEventNew(user.uid, dateISO, id);
      showToast('Événement supprimé avec succès');

    } catch (e) {
      console.error('delete event', e);
      showToast('Erreur lors de la suppression', true);
    } finally {
      closeModal();
    }
  };

  if (!user) {
    return <div>Chargement...</div>;
  }

  return (
    <>
      {state.error && (
        <div className="bg-red-100 text-red-700 p-2 rounded">
          Impossible de charger les événements
        </div>
      )}
      <WeekNavigationHeader
        currentLabel={currentLabel}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        view={view}
        onViewChange={setView}
      />

      <div className="flex justify-end mb-2">
        <button
          onClick={() => openDate(new Date(currentDate))}
          className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
        >
          +
        </button>
      </div>
      {state.loading && showSkeleton ? (
        <div>Chargement des événements...</div>
      ) : view === 'week' ? (
        <WeeklyGrid
          events={weekEvents}
          tasks={tasks}
          onSlotSelect={openSlot}
          onEventClick={openEvent}
          weekStart={weekStart}
        />
      ) : (
        <MonthGrid
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          onDateSelect={openDate}
          onEventClick={openEvent}
        />
      )}
      <EventModal
        isOpen={modal.open}
        onClose={closeModal}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        event={modal.event}
        timeSlot={modal.timeSlot}
        selectedDate={modal.selectedDate}
      />
    </>
  );
}
