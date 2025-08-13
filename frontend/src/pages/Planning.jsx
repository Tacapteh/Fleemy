import { useState, useEffect } from 'react';
import WeeklyGrid from '../components/WeeklyGrid';
import useTeam from '../hooks/useTeam';
import useAuthUser from '../hooks/useAuthUser';

export default function Planning() {
  const { user, authReady } = useAuthUser();
  const { team } = useTeam();
  const teamId = team?.id;
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

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

  if (loadingEvents) {
    return <div>Chargement des événements...</div>;
  }

  return <WeeklyGrid events={events} />;
}
