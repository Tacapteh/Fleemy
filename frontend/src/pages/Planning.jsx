import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PlannerGrid from '../components/PlannerGrid';
import MonthGrid from '../components/MonthGrid';
import WeekNavigationHeader from '../components/WeekNavigationHeader';

import EventModal from '../components/EventModal';
import WeeklyTaskModal from '../components/WeeklyTaskModal';

import useTeam from '../hooks/useTeam';
import useTasks from '../hooks/useTasks';
import {
  useFirebaseUser,
  deleteWeeklyTask,
  saveEventNew,
  deleteEventNew,
  watchWeekEvents,
  setTeamContext,
} from '../firebase';
import { showToast } from '../utils/toast';
import { subscribeToUIEvent } from '../store/uiStore';
import { apiFetch } from '../lib/api';
import { contextStore } from '../stores/contextStore';

// Helpers -------------------------------------------------------------
const safeReadLocalStorage = (key) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeWriteLocalStorage = (key, value) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn("Impossible d'écrire localStorage", { key, error });
  }
};

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
  const navigate = useNavigate();
  const { teamId: routeTeamParam } = useParams();
  const routeTeamId = routeTeamParam || null;

  const [activeTeamId, setActiveTeamId] = useState(() => routeTeamId || safeReadLocalStorage('teamId'));
  const [activeTeamName, setActiveTeamName] = useState(() => safeReadLocalStorage('teamName'));
  const { team } = useTeam(activeTeamId || undefined);
  const teamId = team?.id || activeTeamId || null;
  const [availableTeams, setAvailableTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState(null);

  useEffect(() => {
    if (routeTeamId && routeTeamId !== activeTeamId) {
      setActiveTeamId(routeTeamId);
    }
  }, [routeTeamId, activeTeamId]);

  useEffect(() => {
    if (!user?.uid) {
      setAvailableTeams([]);
      setTeamsError(null);
      return;
    }

    let cancelled = false;
    const loadTeams = async () => {
      setTeamsLoading(true);
      try {
        const data = await apiFetch('/teams/my');
        const teamsList = Array.isArray(data?.teams) ? data.teams : [];
        if (cancelled) {
          return;
        }
        setTeamsError(null);
        setAvailableTeams(teamsList);
        setActiveTeamId((current) => {
          if (!teamsList.length) {
            return null;
          }
          if (current && teamsList.some((t) => t.team_id === current)) {
            return current;
          }
          return teamsList[0].team_id;
        });
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error('Erreur chargement équipes:', err);
        setTeamsError("Impossible de charger les équipes");
        setAvailableTeams([]);
      } finally {
        if (!cancelled) {
          setTeamsLoading(false);
        }
      }
    };

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (team?.name) {
      setActiveTeamName(team.name);
      return;
    }

    if (!teamId) {
      setActiveTeamName(null);
      return;
    }

    const matchingTeam = availableTeams.find((candidate) => candidate.team_id === teamId);
    if (matchingTeam?.name) {
      setActiveTeamName(matchingTeam.name);
    }
  }, [team?.name, teamId, availableTeams]);
  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const planningContextKey = useMemo(
    () => (teamId ? `planning_context_${teamId}` : 'planning_context_solo'),
    [teamId]
  );
  const [planningMode, setPlanningMode] = useState(() => {
    const stored = planningContextKey ? safeReadLocalStorage(planningContextKey) : null;
    if (stored === 'team' || stored === 'personal') {
      if (stored === 'team' && !teamId) {
        return 'personal';
      }
      return stored;
    }
    return teamId ? 'team' : 'personal';
  });

  useEffect(() => {
    if (planningMode === 'team' && teamId) {
      contextStore.set({
        type: 'team',
        teamId,
        teamName: activeTeamName || null,
      });
      safeWriteLocalStorage('teamId', teamId);
      if (activeTeamName) {
        safeWriteLocalStorage('teamName', activeTeamName);
      }
    } else if (planningMode === 'personal') {
      contextStore.set({ type: 'solo' });
    }
  }, [planningMode, teamId, activeTeamName]);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showSkeleton, setShowSkeleton] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(t);
  }, []);

  const [modal, setModal] = useState({ open: false, timeSlot: null, selectedDate: null, event: null, readOnly: false });
  const [weeklyTaskModal, setWeeklyTaskModal] = useState({ open: false, task: null });

  useEffect(() => {
    const stored = planningContextKey ? safeReadLocalStorage(planningContextKey) : null;
    const nextMode = teamId
      ? stored === 'team' || stored === 'personal'
        ? stored
        : 'team'
      : 'personal';
    setPlanningMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [teamId, planningContextKey]);

  useEffect(() => {
    if (!planningContextKey) return;
    safeWriteLocalStorage(planningContextKey, planningMode);
  }, [planningMode, planningContextKey]);

  const storageKey = useMemo(() => {
    if (planningMode !== 'team' || !teamId) {
      return null;
    }
    return `planning_selected_member_${teamId}`;
  }, [planningMode, teamId]);

  const availableMembers = useMemo(() => {
    const ids = new Map();
    if (user?.uid) {
      ids.set(user.uid, {
        uid: user.uid,
        name: user.displayName || null,
        email: user.email || null,
      });
    }
    if (planningMode === 'team' && Array.isArray(team?.members)) {
      team.members.forEach((member) => {
        const uid = typeof member === 'string' ? member : member?.uid;
        if (!uid || ids.has(uid)) return;
        const name =
          (typeof member === 'object' && member?.name) ||
          (typeof member === 'object' && member?.email) ||
          null;
        ids.set(uid, {
          uid,
          name,
          email: typeof member === 'object' ? member?.email || null : null,
        });
      });
    }
    return Array.from(ids.values());
  }, [planningMode, team?.members, user?.uid, user?.displayName, user?.email]);

  const availableMemberIdsKey = useMemo(() => {
    const ids = availableMembers.map((member) => member.uid).filter(Boolean);
    ids.sort();
    return ids.join('|');
  }, [availableMembers]);

  useEffect(() => {
    if (!user?.uid) return;

    if (planningMode !== 'team') {
      setSelectedMemberId(user.uid);
      return;
    }

    const storedValue = storageKey ? localStorage.getItem(storageKey) : null;
    const availableIds = availableMembers.map((member) => member.uid);

    if (storedValue && availableIds.includes(storedValue)) {
      setSelectedMemberId(storedValue);
    } else {
      setSelectedMemberId(user.uid);
    }
  }, [user?.uid, planningMode, storageKey, availableMemberIdsKey, availableMembers]);

  useEffect(() => {
    if (planningMode !== 'team') return;
    if (!storageKey || !selectedMemberId) return;
    const availableIds = availableMembers.map((member) => member.uid);
    if (!availableIds.includes(selectedMemberId)) return;
    localStorage.setItem(storageKey, selectedMemberId);
  }, [selectedMemberId, storageKey, availableMemberIdsKey, availableMembers, planningMode]);

  const viewedUserId = planningMode === 'team' ? selectedMemberId || user?.uid : user?.uid;
  const isReadOnlyMode =
    planningMode === 'team' && viewedUserId && viewedUserId !== user?.uid;

  console.log('Planning: Contexte utilisateur', {
    user: user?.uid,
    userDisplayName: user?.displayName,
    team: team?.id,
    selectedMemberId,
    viewedUserId,
    isReadOnlyMode,
    planningMode,
  });

  const teamOptions = useMemo(() => {
    if (!Array.isArray(availableTeams)) {
      return [];
    }

    const options = [];
    const seen = new Set();

    availableTeams.forEach((availableTeam) => {
      if (!availableTeam?.team_id || seen.has(availableTeam.team_id)) {
        return;
      }
      seen.add(availableTeam.team_id);
      options.push({
        value: availableTeam.team_id,
        label: availableTeam.name || 'Équipe',
      });
    });

    if (teamId && !seen.has(teamId)) {
      seen.add(teamId);
      options.push({
        value: teamId,
        label: activeTeamName || team?.name || 'Équipe',
      });
    }

    return options;
  }, [availableTeams, teamId, activeTeamName, team?.name]);

  const memberOptions = useMemo(() => {
    if (planningMode !== 'team') {
      return [];
    }
    const options = [];
    const seen = new Set();

    availableMembers.forEach((member) => {
      if (!member?.uid || seen.has(member.uid)) return;
      seen.add(member.uid);

      const labelBase =
        member?.name ||
        member?.email ||
        (member.uid === user?.uid
          ? user?.displayName || user?.email || 'Moi'
          : `Membre ${member.uid.slice(0, 6)}`);

      options.push({
        value: member.uid,
        label: member.uid === user?.uid ? labelBase || 'Moi' : labelBase,
      });
    });

    return options;
  }, [planningMode, availableMembers, user?.uid, user?.displayName, user?.email]);

  const handleMemberChange = useCallback((memberId) => {
    if (planningMode !== 'team') return;
    if (!memberId) return;
    if (memberId === selectedMemberId) return;
    const availableIds = availableMembers.map((member) => member.uid);
    if (!availableIds.includes(memberId)) return;
    setSelectedMemberId(memberId);
  }, [planningMode, availableMembers, selectedMemberId]);

  const handleTeamChange = useCallback(
    (nextTeamId) => {
      if (!nextTeamId || nextTeamId === activeTeamId) {
        return;
      }
      setActiveTeamId(nextTeamId);
      setPlanningMode('team');
      if (routeTeamId) {
        navigate(`/team/${nextTeamId}/schedule`, { replace: true });
      }
    },
    [activeTeamId, navigate, routeTeamId]
  );

  const handlePlanningModeChange = useCallback(
    (mode) => {
      if (mode === planningMode) return;
      if (mode === 'team') {
        if (!teamId && !teamOptions.length) {
          return;
        }
        if (!teamId && teamOptions.length) {
          const fallbackTeamId = teamOptions[0].value;
          if (fallbackTeamId && fallbackTeamId !== activeTeamId) {
            setActiveTeamId(fallbackTeamId);
          }
        }
        setPlanningMode('team');
        return;
      }
      setPlanningMode('personal');
    },
    [planningMode, teamId, teamOptions, activeTeamId]
  );



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

  // Hook pour les tâches hebdomadaires - seulement si on a un utilisateur
  const weekStartISO = weekStart.toISOString().split('T')[0];
  const effectiveTeamId = planningMode === 'team' ? teamId || null : null;
  const {
    tasks: weeklyTasks,
    occurrences: taskOccurrences,
    loading: tasksLoading,
    error: tasksError
  } = useTasks(
    user?.uid ? (planningMode === 'team' ? viewedUserId || user.uid : user.uid) : null,
    weekStartISO,
    effectiveTeamId
  );
  
  console.log('Planning: Hook useTasks', { 
    userId: user?.uid,
    viewedUserId, 
    finalUserId: user?.uid ? (viewedUserId || user.uid) : null,
    weekStartISO, 
    weeklyTasksCount: weeklyTasks.length, 
    taskOccurrencesCount: taskOccurrences.length,
    tasksLoading,
    tasksError
  });

  useEffect(() => {
    if (!user) {
      setTeamContext(null);
      setEvents([]);
      return () => {};
    }

    setTeamContext(planningMode === 'team' ? teamId || null : null);
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
        docs.forEach((doc, idxDoc) => {
          const data = typeof doc.data === 'function' ? doc.data() : doc;

          // New format: direct event objects { start, end, ... }
          if (data.start && data.end) {
            const startDate = new Date(data.start);
            const endDate = new Date(data.end);
            if (isNaN(startDate) || isNaN(endDate)) return;
            const date = startDate.toISOString().split('T')[0];
            const ownerId = data.user_id || data.uid || data.owner_id || null;
            normalized.push({
              id: data.id || doc.id || `event_${idxDoc}`,
              date,
              day: Number.isInteger(data.day) ? data.day : dayIndex(date),
              start: startDate,
              end: endDate,
              status: data.status,
              title: data.title || data.client || data.description || '',
              client: data.client || data.client_name || '',
              description: data.description || '',
              readOnly: Boolean(data.readOnly) || (ownerId && ownerId !== user.uid),
              user_id: ownerId,
            });
            return;
          }

          // Legacy format: documents containing `slots` or `events`
          const date = toYMDFromDoc(doc, data);
          if (!date) return;
          const items = Array.isArray(data?.slots)
            ? data.slots
            : data?.events || [];
          items.forEach((item, idx) => {
            const ownerId = item.user_id || item.uid || item.owner_id || null;
            normalized.push({
              id: item.id || `${doc?.id || 'auto'}_${idx}`,
              date,
              day: Number.isInteger(item.day) ? item.day : dayIndex(date),
              start: toHM(item.start),
              end: toHM(item.end),
              status: item.status,
              title: item.title || item.client || item.description || '',
              readOnly: Boolean(item.readOnly) || (ownerId && ownerId !== user.uid),
              user_id: ownerId,
            });
          });
        });
        const filtered = normalized.filter((event) => {
          if (planningMode !== 'team') {
            return !event.user_id || event.user_id === user.uid;
          }
          if (!viewedUserId) return true;
          if (!event.user_id) {
            return viewedUserId === user.uid;
          }
          return event.user_id === viewedUserId;
        });
        setEvents(filtered);
        setLoading(false);
      },
      (error) => {
        console.error('Erreur watchWeekEvents:', error);
        setError(error.message);
        setEvents([]);
        setLoading(false);
      }
    );

    return () => {
      unsubEvents && unsubEvents();
    };
  }, [user?.uid, teamId, weekStart, weekEnd, viewedUserId, user, planningMode]);


  const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const openSlot = (start) => {
    if (isReadOnlyMode) return;
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
    if (isReadOnlyMode) return;
    setModal({ open: true, selectedDate: date, timeSlot: null, event: null, readOnly: false });
  };

  const openWeek = (date) => {
    setView('week');
    setCurrentDate(date);
  };

  const openEvent = (event) => {
    const readOnly = event.readOnly || (event.user_id && event.user_id !== user.uid);
    setModal({ open: true, event, timeSlot: null, selectedDate: null, readOnly });
  };

  const closeModal = () => setModal({ open: false, timeSlot: null, selectedDate: null, event: null, readOnly: false });

  const openNewWeeklyTask = () => {
    if (isReadOnlyMode) return;
    setWeeklyTaskModal({ open: true, task: null });
  };
  const handleTaskClick = (taskOccurrence) => {
    // Récupérer la tâche originale depuis weeklyTasks
    const originalTask = weeklyTasks.find(t => t.id === taskOccurrence.taskId);
    if (originalTask) {
      setWeeklyTaskModal({ open: true, task: originalTask });
    } else {
      console.error('Tâche originale non trouvée:', taskOccurrence.taskId);
    }
  };
  const closeWeeklyTaskModal = useCallback(() => setWeeklyTaskModal({ open: false, task: null }), [setWeeklyTaskModal]);

  const handleSaveWeeklyTask = () => {
    showToast('Tâche hebdomadaire sauvegardée avec succès');
    closeWeeklyTaskModal();
  };

  const handleDeleteWeeklyTask = useCallback(async (id) => {
    if (!user || isReadOnlyMode) return;
    try {
      await deleteWeeklyTask(id);
      showToast('Tâche hebdomadaire supprimée');
    } catch (e) {
      console.error('delete weekly task', e);
      showToast('Erreur lors de la suppression de la tâche hebdomadaire', true);
    } finally {
      closeWeeklyTaskModal();
    }
  }, [user, isReadOnlyMode, closeWeeklyTaskModal]);

  useEffect(() => {
    const unsubscribeOpen = subscribeToUIEvent('openTaskModal', (taskId) => {
      const originalTask = weeklyTasks.find((task) => task.id === taskId);
      if (originalTask) {
        setWeeklyTaskModal({ open: true, task: originalTask });
      } else {
        console.warn('Tâche originale non trouvée:', taskId);
      }
    });

    const unsubscribeDelete = subscribeToUIEvent('confirmDeleteTask', (taskId) => {
      if (isReadOnlyMode) {
        return;
      }

      const originalTask = weeklyTasks.find((task) => task.id === taskId);
      if (!originalTask) {
        console.warn('Tâche originale non trouvée:', taskId);
        return;
      }

      const confirmed = window.confirm(`Supprimer la tâche "${originalTask.label}" ?`);
      if (!confirmed) {
        return;
      }

      handleDeleteWeeklyTask(taskId);
    });

    return () => {
      unsubscribeOpen();
      unsubscribeDelete();
    };
  }, [weeklyTasks, isReadOnlyMode, handleDeleteWeeklyTask]);

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
        team_id: planningMode === 'team' ? teamId || null : null,
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
        <div className="bg-red-100 text-red-700 p-2 rounded mb-2">
          Impossible de charger les événements
        </div>
      )}
      {tasksError && (
        <div className="bg-orange-100 text-orange-700 p-2 rounded mb-2">
          Erreur chargement tâches: {tasksError}
        </div>
      )}
      {teamsError && (
        <div className="bg-yellow-100 text-yellow-800 p-2 rounded mb-2">
          {teamsError}
        </div>
      )}
      <WeekNavigationHeader
        currentLabel={currentLabel}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        view={view}
        onViewChange={setView}
        memberOptions={memberOptions}
        selectedMemberId={viewedUserId}
        onMemberChange={handleMemberChange}
        isReadOnlyMode={isReadOnlyMode}
        planningMode={planningMode}
        onPlanningModeChange={handlePlanningModeChange}
        canUseTeamMode={teamOptions.length > 0}
        teamName={activeTeamName || team?.name || null}
        teamOptions={teamOptions}
        selectedTeamId={planningMode === 'team' ? teamId : null}
        onTeamChange={handleTeamChange}
        teamsLoading={teamsLoading}
      />

      <div className="flex justify-end mb-2 space-x-2">
        <button
          onClick={() => openDate(new Date(currentDate))}
          className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isReadOnlyMode}
        >
          + Événement
        </button>
        <button
          onClick={openNewWeeklyTask}
          className="px-3 py-1 bg-blue-300 rounded hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isReadOnlyMode}
        >
          + Tâche hebdomadaire
        </button>
      </div>
      {loading && showSkeleton ? (
        <div>Chargement des événements...</div>
      ) : view === 'week' ? (
        <PlannerGrid
          events={events}
          tasks={weeklyTasks.length ? weeklyTasks : taskOccurrences}
          onSlotSelect={openSlot}
          onEventClick={openEvent}
          onTaskClick={handleTaskClick}
          weekStart={weekStart}
          isReadOnlyMode={isReadOnlyMode}
        />
      ) : (
        <MonthGrid
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          onDateSelect={openWeek}
          onCreateEvent={openDate}
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
      <WeeklyTaskModal
        isOpen={weeklyTaskModal.open}
        onClose={closeWeeklyTaskModal}
        onSave={handleSaveWeeklyTask}
        onDelete={handleDeleteWeeklyTask}
        task={weeklyTaskModal.task}
      />
    </>
  );
}
