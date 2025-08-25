import { useState, useEffect, useReducer } from 'react';
import WeeklyGrid from '../components/WeeklyGrid';
import MonthCalendar from '../components/MonthCalendar';
import WeekNavigationHeader from '../components/WeekNavigationHeader';

import EventModal from '../components/EventModal';

import useTeam from '../hooks/useTeam';
import useAuthUser from '../hooks/useAuthUser';
import { loadEvents, clearEventsCache } from '../utils/loadEvents';

export default function Planning() {
  const { user, authReady } = useAuthUser();
  const { team } = useTeam();
  const teamId = team?.id;
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const initialState = { loading: true, error: null, events: [] };
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
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(t);
  }, []);

  const [modal, setModal] = useState({ open: false, timeSlot: null, selectedDate: null, event: null });

  const DAY_INDEX = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };

  const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  };

  useEffect(() => {
    if (!authReady || !user) return;

    const controller = new AbortController();
    dispatch({ type: 'loading' });

    const weekStart = startOfWeek(currentDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const format = (d) => d.toISOString().slice(0, 10);
    const from = format(weekStart);
    const to = format(weekEnd);
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    (async () => {
      try {
        const list = await loadEvents(from, to, teamId, controller.signal);
        const data = list.map((evt) => {
          const dayIdx = DAY_INDEX[evt.day?.toLowerCase()] ?? 0;
          const startDate = new Date(weekStart);
          startDate.setDate(weekStart.getDate() + dayIdx);
          const [sh, sm] = (evt.start_time || '').split(':').map(Number);
          startDate.setHours(sh || 0, sm || 0, 0, 0);
          const endDate = new Date(weekStart);
          endDate.setDate(weekStart.getDate() + dayIdx);
          const [eh, em] = (evt.end_time || '').split(':').map(Number);
          endDate.setHours(eh || 0, em || 0, 0, 0);
          return { ...evt, start: startDate, end: endDate };
        });
        if (!controller.signal.aborted) {
          dispatch({ type: 'events', events: data });
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          dispatch({ type: 'error', error: e.message || 'Erreur de chargement' });
        }
      } finally {
        clearTimeout(timeoutId);
        if (!controller.signal.aborted) {
          dispatch({ type: 'done' });
        }
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [authReady, user, teamId, currentDate]);

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

  const weekStart = startOfWeek(currentDate);
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
    try {
      const token = await user.getIdToken();
      const dayIndex = data.day;
      const startDate = new Date(weekStart);
      startDate.setDate(weekStart.getDate() + dayIndex);
      const [sh, sm] = data.start.split(':').map(Number);
      startDate.setHours(sh, sm, 0, 0);
      const endDate = new Date(weekStart);
      endDate.setDate(weekStart.getDate() + dayIndex);
      const [eh, em] = data.end.split(':').map(Number);
      endDate.setHours(eh, em, 0, 0);
      const payload = {
        description: data.description,
        client_id: data.client_id || '',
        client_name: data.client_name || '',
        day: DAY_KEYS[dayIndex] || 'monday',
        start_time: data.start,
        end_time: data.end,
        status: data.type || 'pending',
      };
      const res = await fetch('/api/planning/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, year: currentDate.getFullYear(), week: getWeekNumber(currentDate) }),
      });
      const result = await res.json();
      if (result.event) {
        dispatch({
          type: 'add',
          event: { ...result.event, start: startDate, end: endDate },
        });
      }
    } catch (e) {
      console.error('save event', e);
    } finally {
      closeModal();
      clearEventsCache();
    }
  };

  const handleDeleteEvent = async (id) => {
    try {
      const token = await user.getIdToken();
      await fetch(`/api/planning/events/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      dispatch({ type: 'remove', id });
    } catch (e) {
      console.error('delete event', e);
    } finally {
      closeModal();
      clearEventsCache();
    }
  };


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
          onSlotSelect={openSlot}
          onEventClick={openEvent}
          weekStart={weekStart}
        />
      ) : (
        <MonthCalendar
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          events={monthEvents}
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
