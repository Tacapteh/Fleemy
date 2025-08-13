import { useState, useEffect } from 'react';
import WeeklyGrid from '../components/WeeklyGrid';
import MonthCalendar from '../components/MonthCalendar';
import WeekNavigationHeader from '../components/WeekNavigationHeader';
import EventModal from '../components/EventModal';
import useTeam from '../hooks/useTeam';
import useAuthUser from '../hooks/useAuthUser';

export default function Planning() {
  const { user, authReady } = useAuthUser();
  const { team } = useTeam();
  const teamId = team?.id;
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modal, setModal] = useState({ open: false, timeSlot: null, selectedDate: null, event: null });

  function normalizeEvent(evt) {
    const toDate = (v) =>
      v instanceof Date ? v : v?.toDate ? v.toDate() : new Date(v);
    const startDate = toDate(evt.start);
    const endDate = toDate(evt.end);
    const hhmm = (d) =>
      `${d.getHours().toString().padStart(2, '0')}:${d
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
    return {
      ...evt,
      start: startDate,
      end: endDate,
      start_time: hhmm(startDate),
      end_time: hhmm(endDate),
    };
  }

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    setLoadingEvents(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        const base = '/api/events';
        const qs = teamId ? `teamId=${teamId}` : `userId=${user.uid}`;
        const res = await fetch(`${base}?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const list = await res.json();
        const data = list.map(normalizeEvent);
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
  }, [authReady, user, teamId]);

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
  const weekEvents = events.filter(
    (e) => e.start >= weekStart && e.start < new Date(weekStart.getTime() + 7 * 86400000),
  );
  const monthEvents = events.filter(
    (e) =>
      e.start.getFullYear() === currentDate.getFullYear() &&
      e.start.getMonth() === currentDate.getMonth(),
  );

  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

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
        day: DAYS[dayIndex]?.toLowerCase() || 'monday',
        start_time: data.start,
        end_time: data.end,
        status: data.type || 'pending',
      };
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.event) {
        setEvents((prev) => [
          ...prev,
          normalizeEvent({ ...result.event, start: startDate, end: endDate }),
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
      await fetch(`/api/events/${id}`, {
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
