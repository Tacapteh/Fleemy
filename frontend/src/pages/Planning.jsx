import { useState, useEffect } from 'react';
import WeeklyGrid from '../components/WeeklyGrid';
import MonthCalendar from '../components/MonthCalendar';
import WeekNavigationHeader from '../components/WeekNavigationHeader';
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
      {view === 'week' ? (
        <WeeklyGrid events={weekEvents} />
      ) : (
        <MonthCalendar
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          events={monthEvents}
        />
      )}
    </>
  );
}
