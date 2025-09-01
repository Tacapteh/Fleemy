import { useState, useEffect, useMemo } from 'react';
import WeeklyGrid from '../components/WeeklyGrid';
import MonthGrid from '../components/MonthGrid';
import WeekNavigationHeader from '../components/WeekNavigationHeader';

import EventModal from '../components/EventModal';

import useTeam from '../hooks/useTeam';
import {
  useFirebaseUser,
  watchTasks,
  saveEventNew,
  deleteEventNew,
  watchWeekEvents,
  setTeamContext,
} from '../firebase';
import { showToast } from '../utils/toast';

// Helpers -------------------------------------------------------------
function toHM(v) {
  let date = null;
  if (typeof v === 'string') {
    if (v.includes(':')) {
      const [h, m] = v.split(':');
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const n = Number(v);
    if (!isNaN(n)) {
      const h = Math.floor(n / 60);
      const m = n % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    date = new Date(v);
  } else if (typeof v === 'number') {
    const h = Math.floor(v / 60);
    const m = v % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else if (v instanceof Date) {
    date = v;
  } else if (v && typeof v.toDate === 'function') {
    date = v.toDate();
  }
  if (date instanceof Date && !isNaN(date.getTime())) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes(),
    ).padStart(2, '0')}`;
  }
  return '00:00';
}

function toYMDFromDoc(doc, data) {
  if (data?.date) return data.date;
  if (doc?.id) {
    const m = doc.id.match(/_(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return null;
}

function dayIndex(d) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return (date.getDay() + 6) % 7;
}

export default function Planning() {
  const user = useFirebaseUser();
  const { team } = useTeam();
  const teamId = team?.id;
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showSkeleton, setShowSkeleton] = useState(true);
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(t);
  }, []);

  const [modal, setModal] = useState({ open: false, timeSlot: null, selectedDate: null, event: null, readOnly: false });



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
      setEvents([]);
      setTasks([]);
      return () => {};
    }

    setTeamContext(teamId || null);
    setLoading(true);
    setError(null);

    const weekStartISO = weekStart.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekEndISO = weekEnd.toISOString().split('T')[0]; // YYYY-MM-DD

    const unsubEvents = watchWeekEvents(
      user.uid,
      weekStartISO,
      weekEndISO,
      (snapshot) => {
        const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : snapshot;
        const normalized = [];
        docs.forEach((doc) => {
          const data = typeof doc.data === 'function' ? doc.data() : doc;
          const date = toYMDFromDoc(doc, data);
          if (!date) return;
          const items = Array.isArray(data?.slots)
            ? data.slots
            : data?.events || [];
          items.forEach((item, idx) => {
            normalized.push({
              id: item.id || `${doc?.id || 'auto'}_${idx}`,
              date,
              day: Number.isInteger(item.day) ? item.day : dayIndex(date),
              start: toHM(item.start),
              end: toHM(item.end),
              status: item.status,
              title:
                item.title || item.client || item.description || '',
            });
          });
        });
        setEvents(normalized);
        setLoading(false);
      },
      (error) => {
        console.error('Erreur watchWeekEvents:', error);
        setError(error.message);
        setEvents([]);
        setLoading(false);
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
      readOnly: false,
    });
  };

  const openDate = (date) => {
    setModal({ open: true, selectedDate: date, timeSlot: null, event: null, readOnly: false });
  };

  const openEvent = (event) => {
    const readOnly = event.readOnly || (event.user_id && event.user_id !== user.uid);
    setModal({ open: true, event, timeSlot: null, selectedDate: null, readOnly });
  };

  const closeModal = () => setModal({ open: false, timeSlot: null, selectedDate: null, event: null, readOnly: false });

  const handleSaveEvent = async (data) => {
    if (!user || modal.readOnly) return;
    try {
      const dayIndex = data.day;
      const startDate = new Date(weekStart);
      startDate.setDate(weekStart.getDate() + dayIndex);
      const [sh, sm] = toHM(data.start).split(':').map(Number);
      startDate.setHours(sh, sm, 0, 0);
      const endDate = new Date(weekStart);
      endDate.setDate(weekStart.getDate() + dayIndex);
      const [eh, em] = toHM(data.end).split(':').map(Number);
      endDate.setHours(eh, em, 0, 0);

      const { from, to } = weekRange;
      if (startDate < from || endDate > to) {
        console.warn('Event en dehors de la plage, création annulée');
        return;
      }

      // Utiliser la nouvelle structure avec saveEventNew
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
        user_id: user.uid,
        team_id: teamId || null,
      };

      await saveEventNew(eventData);
      showToast('Événement sauvegardé avec succès');

    } catch (e) {
      console.error('save event', e);
      showToast('Erreur lors de la sauvegarde', true);
    } finally {
      closeModal();
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!user || modal.readOnly) return;
    try {
      // Vérifier que l'événement existe avant suppression
      const event = events.find(e => e.id === id);
      if (!event) {
        console.error('Event non trouvé pour suppression:', id);
        return;
      }

      await deleteEventNew(id);
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
      {error && (
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
      {loading && showSkeleton ? (
        <div>Chargement des événements...</div>
      ) : view === 'week' ? (
        <WeeklyGrid
          events={events}
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
        readOnly={modal.readOnly}
      />
    </>
  );
}
