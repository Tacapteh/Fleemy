import { useState, useEffect } from 'react';
import WeeklyGrid from '../components/WeeklyGrid';
import MonthCalendar from '../components/MonthCalendar';
import WeekNavigationHeader from '../components/WeekNavigationHeader';

import EventModal from '../components/EventModal';

import useTeam from '../hooks/useTeam';
import useAuthUser from '../hooks/useAuthUser';
import { loadEvents } from '../utils/loadEvents';

export default function Planning() {
  const { user, authReady } = useAuthUser();
  const { team } = useTeam();
  const teamId = team?.id;
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());

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
    let cancelled = false;
    setLoadingEvents(true);
    (async () => {
      try {
        const year = currentDate.getFullYear();
        const week = getWeekNumber(currentDate);
        const weekStart = startOfWeek(currentDate);
        const list = await loadEvents(year, week, teamId);
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
        if (!cancelled) setEvents(data);
      } catch (e) {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    })();
    return () => {
      cancelled = true;
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
  const weekEvents = events;
  const monthEvents = events;

  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const openSlot = (dayName, hour) => {
    const dayIndex = DAYS.indexOf(dayName);
    const nextHour = `${String(parseInt(hour.split(':')[0]) + 1).padStart(2, '0')}:00`;
    setModal({ open: true, timeSlot: { day: dayIndex, start: hour, end: nextHour }, selectedDate: null, event: null });
  };

  const openDate = (date) => {
    setModal({ open: true, selectedDate: date, timeSlot: null, event: null });
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
        setEvents((prev) => [
          ...prev,
          { ...result.event, start: startDate, end: endDate },
        ]);
      }
    } catch (e) {
      console.error('save event', e);
    } finally {
      closeModal();
    }
  };

  const handleDeleteEvent = async (id) => {
    try {
      const token = await user.getIdToken();
      await fetch(`/api/planning/events/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error('delete event', e);
    } finally {
      closeModal();
    }
  };


  if (loadingEvents) {
    return <div>Chargement des événements...</div>;
  }

  return (
    <>
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
      {view === 'week' ? (
        <WeeklyGrid events={weekEvents} onSlotSelect={openSlot} />
      ) : (
        <MonthCalendar
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          events={monthEvents}
          onDateSelect={openDate}
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
