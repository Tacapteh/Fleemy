import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import PlannerGrid from '../components/PlannerGrid';
import MonthGrid from '../components/MonthGrid';
import WeekNavigationHeader from '../components/WeekNavigationHeader';
import EventModal from '../components/EventModal';
import WeeklyTaskModal from '../components/WeeklyTaskModal';
import useTeam from '../hooks/useTeam';
import useTasks from '../hooks/useTasks';
import {
  useFirebaseUser,
  watchWeekEvents,
  saveEventNew,
  deleteEventNew,
  deleteWeeklyTask,
  setTeamContext,
  listenTeamMemberships,
} from '../firebase';
import { apiFetch } from '../lib/api';
import { showToast } from '../utils/toast';
import { subscribeToUIEvent } from '../store/uiStore';
import { contextStore } from '../stores/contextStore';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DEFAULT_START = '09:00';
const DEFAULT_END = '10:00';

const toIsoDate = (date) => {
  if (!(date instanceof Date)) {
    return null;
  }
  return date.toISOString().split('T')[0];
};

const toTimeString = (value) => {
  if (!value) return DEFAULT_START;
  if (typeof value === 'string' && value.includes(':')) {
    return value;
  }
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  return DEFAULT_START;
};

const startOfWeek = (date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfWeek = (weekStart) => {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const formatWeekLabel = (date) => {
  const start = startOfWeek(date);
  const end = endOfWeek(start);
  const startStr = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const endStr = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Semaine du ${startStr} au ${endStr}`;
};

const formatMonthLabel = (date) => date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

const buildMemberLabel = (member, currentUser) => {
  if (!member) {
    return 'Membre';
  }
  const base = member.displayName || member.email || null;
  if (member.uid === currentUser?.uid) {
    return base || currentUser.displayName || currentUser.email || 'Moi';
  }
  if (base) {
    return base;
  }
  return `Membre ${member.uid.slice(0, 6)}`;
};

export default function Planning() {
  const user = useFirebaseUser();
  const { teamId: routeTeamId } = useParams();
  const isTeamContext = Boolean(routeTeamId);
  const teamId = routeTeamId || null;

  const [view, setView] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);

  const [modal, setModal] = useState({ open: false, event: null, selectedDate: null, readOnly: false });
  const [weeklyTaskModal, setWeeklyTaskModal] = useState({ open: false, task: null });

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [teamMembershipReady, setTeamMembershipReady] = useState(!isTeamContext);

  const { team } = useTeam(isTeamContext ? routeTeamId : null);
  const teamName = team?.name || null;

  const weekStart = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  const weekStartISO = useMemo(() => toIsoDate(weekStart), [weekStart]);
  const weekEndISO = useMemo(() => toIsoDate(weekEnd), [weekEnd]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }
    if (isTeamContext && teamId) {
      contextStore.set({ type: 'team', teamId, teamName: teamName || null });
      setTeamContext(teamId);
    } else {
      contextStore.set({ type: 'solo' });
      setTeamContext(null);
    }
  }, [isTeamContext, teamId, teamName, user?.uid]);

  useEffect(() => {
    if (!isTeamContext) {
      setTeamMembershipReady(true);
      return;
    }

    if (!user?.uid || !teamId) {
      setTeamMembershipReady(false);
      return;
    }

    let cancelled = false;
    setTeamMembershipReady(false);

    const ensureMembership = async () => {
      try {
        await apiFetch(`/teams/${teamId}/memberships/ensure`, {
          method: 'POST',
          body: JSON.stringify({ include_joined_at: false }),
        });
        if (!cancelled) {
          setTeamMembershipReady(true);
        }
      } catch (error) {
        console.error('ensureTeamMembership error', error);
        if (!cancelled) {
          showToast("Impossible de vérifier votre appartenance à l'équipe", true);
          setTeamMembershipReady(true);
        }
      }
    };

    ensureMembership();

    return () => {
      cancelled = true;
    };
  }, [isTeamContext, teamId, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setMembers([]);
      setMembersError(null);
      setMembersLoading(false);
      setSelectedMemberId(null);
      return;
    }

    if (!isTeamContext) {
      const personalMember = {
        uid: user.uid,
        displayName: user.displayName || null,
        email: user.email || null,
      };
      setMembers([personalMember]);
      setMembersError(null);
      setMembersLoading(false);
      setSelectedMemberId(user.uid);
      return;
    }

    if (!teamId) {
      return;
    }

    if (!teamMembershipReady) {
      setMembers([]);
      setMembersLoading(true);
      setMembersError(null);
      setSelectedMemberId(null);
      return () => {};
    }

    setMembersLoading(true);
    setMembersError(null);

    const unsubscribe = listenTeamMemberships(
      teamId,
      (rawMembers = []) => {
        const seen = new Set();
        const resolvedMembers = [];

        const appendMember = (member) => {
          if (!member || !member.uid || seen.has(member.uid)) {
            return;
          }
          seen.add(member.uid);
          resolvedMembers.push({
            ...member,
            uid: member.uid,
            displayName:
              member.displayName ||
              (member.uid === user.uid ? user.displayName || null : null),
            email:
              member.email || (member.uid === user.uid ? user.email || null : null),
          });
        };

        const membershipEntries = Array.isArray(rawMembers) ? rawMembers : [];
        membershipEntries.forEach(appendMember);

        if (!seen.has(user.uid)) {
          seen.add(user.uid);
          resolvedMembers.unshift({
            uid: user.uid,
            displayName: user.displayName || null,
            email: user.email || null,
          });
        }

        setMembers(resolvedMembers);
        setMembersLoading(false);
        setMembersError(null);

        setSelectedMemberId((current) => {
          if (current && seen.has(current)) {
            return current;
          }
          if (seen.has(user.uid)) {
            return user.uid;
          }
          return resolvedMembers[0]?.uid || null;
        });
      },
      (error) => {
        console.error('listenTeamMemberships error', error);
        setMembers([]);
        setMembersError("Impossible de charger les membres de l'équipe");
        setMembersLoading(false);
      }
    );

    return () => unsubscribe();
  }, [
    isTeamContext,
    teamId,
    teamMembershipReady,
    user?.uid,
    user?.displayName,
    user?.email,
  ]);

  const planningContext = useMemo(() => {
    if (!user?.uid) {
      return null;
    }
    if (isTeamContext) {
      if (!teamMembershipReady || !teamId || !selectedMemberId) {
        return null;
      }
      return { type: 'team', teamId, memberUid: selectedMemberId };
    }
    return { type: 'personal', userId: user.uid };
  }, [isTeamContext, teamId, selectedMemberId, teamMembershipReady, user?.uid]);

  const planningContextKey = useMemo(() => {
    if (!planningContext) return 'none';
    if (planningContext.type === 'team') {
      return `team:${planningContext.teamId}:${planningContext.memberUid}`;
    }
    return `personal:${planningContext.userId}`;
  }, [planningContext]);

  const readOnly = useMemo(() => {
    if (!isTeamContext) {
      return false;
    }
    if (!selectedMemberId || !user?.uid) {
      return true;
    }
    return selectedMemberId !== user.uid;
  }, [isTeamContext, selectedMemberId, user?.uid]);

  useEffect(() => {
    if (isTeamContext && !teamMembershipReady) {
      setEvents([]);
      setEventsLoading(true);
      setEventsError(null);
      return () => {};
    }

    if (!planningContext || !weekStartISO || !weekEndISO) {
      setEvents([]);
      return;
    }

    setEventsLoading(true);
    setEventsError(null);

    const unsubscribe = watchWeekEvents(
      planningContext,
      weekStartISO,
      weekEndISO,
      (loadedEvents) => {
        setEvents(loadedEvents);
        setEventsLoading(false);
      },
      (error) => {
        console.error('watchWeekEvents error', error);
        setEvents([]);
        setEventsLoading(false);
        setEventsError('Impossible de charger les événements');
      }
    );

    return () => unsubscribe();
  }, [
    planningContextKey,
    weekStartISO,
    weekEndISO,
    planningContext,
    isTeamContext,
    teamMembershipReady,
  ]);

  const {
    tasks: weeklyTasks,
    occurrences: taskOccurrences,
    loading: tasksLoading,
    error: tasksError,
  } = useTasks(planningContext, weekStartISO);

  const handleDeleteWeeklyTask = useCallback(
    async (taskId) => {
      if (readOnly) {
        return;
      }
      if (!planningContext) {
        return;
      }
      try {
        await deleteWeeklyTask(planningContext, taskId);
      } catch (error) {
        console.error('deleteWeeklyTask error', error);
        showToast('Erreur lors de la suppression de la tâche', true);
      } finally {
        setWeeklyTaskModal({ open: false, task: null });
      }
    },
    [planningContext, readOnly]
  );

  useEffect(() => {
    const cleanupFns = [];

    const unsubscribeOpen = subscribeToUIEvent('openTaskModal', (taskId) => {
      if (readOnly) {
        return;
      }
      if (!taskId) return;
      const original = weeklyTasks.find((task) => task.id === taskId);
      if (original) {
        setWeeklyTaskModal({ open: true, task: original });
      }
    });

    const unsubscribeDelete = subscribeToUIEvent('confirmDeleteTask', (taskId) => {
      if (readOnly) {
        return;
      }
      const original = weeklyTasks.find((task) => task.id === taskId);
      if (!original) {
        return;
      }
      const confirmed = window.confirm(`Supprimer la tâche "${original.label}" ?`);
      if (!confirmed) {
        return;
      }
      handleDeleteWeeklyTask(taskId);
    });

    cleanupFns.push(unsubscribeOpen, unsubscribeDelete);

    return () => {
      cleanupFns.forEach((fn) => {
        if (typeof fn === 'function') fn();
      });
    };
  }, [weeklyTasks, readOnly, handleDeleteWeeklyTask]);

  const openCreateModal = useCallback(
    (date) => {
      if (readOnly || !planningContext) return;
      const start = date ? new Date(date) : new Date();
      start.setHours(9, 0, 0, 0);
      setModal({ open: true, event: null, selectedDate: start, readOnly: false });
    },
    [readOnly, planningContext]
  );

  const openEventModal = useCallback(
    (event) => {
      if (!event) return;
      setModal({ open: true, event, selectedDate: new Date(event.start), readOnly });
    },
    [readOnly]
  );

  const closeModal = useCallback(() => {
    setModal({ open: false, event: null, selectedDate: null, readOnly: false });
  }, []);

  const openWeeklyTaskModal = useCallback(() => {
    if (readOnly || !planningContext) return;
    setWeeklyTaskModal({ open: true, task: null });
  }, [readOnly, planningContext]);

  const closeWeeklyTaskModal = useCallback(() => {
    setWeeklyTaskModal({ open: false, task: null });
  }, []);

  const handleSaveEvent = useCallback(
    async (data) => {
      if (!planningContext || readOnly || modal.readOnly) {
        return;
      }
      try {
        const dayIndex = data.day ?? data.dayIndex ?? 0;
        const eventDate = new Date(weekStart);
        eventDate.setDate(weekStart.getDate() + dayIndex);
        const [startHour, startMinute] = toTimeString(data.start || DEFAULT_START).split(':').map(Number);
        const [endHour, endMinute] = toTimeString(data.end || DEFAULT_END).split(':').map(Number);

        const start = new Date(eventDate);
        start.setHours(startHour, startMinute, 0, 0);
        const end = new Date(eventDate);
        end.setHours(endHour, endMinute, 0, 0);

        if (end <= start) {
          showToast("L'heure de fin doit être après l'heure de début", true);
          return;
        }

        const payload = {
          id: data.id,
          start: start.toISOString(),
          end: end.toISOString(),
          client: data.client_name || data.description || '',
          status: data.status || data.type || 'unpaid',
          hourly_rate: data.hourly_rate || 50,
          duration: Math.round((end - start) / (60 * 1000)),
          task_id: data.task_id || null,
          description: data.description || '',
          client_id: data.client_id || '',
          client_name: data.client_name || '',
          day: DAY_KEYS[dayIndex] || 'monday',
        };

        const savedEvent = await saveEventNew(planningContext, payload);
        if (savedEvent?.source === 'api-fallback' && savedEvent?.id) {
          setEvents((current) => {
            const others = Array.isArray(current)
              ? current.filter((evt) => evt && evt.id !== savedEvent.id)
              : [];
            const nextEvents = [...others, savedEvent];
            nextEvents.sort((a, b) => {
              const aTime = a?.start instanceof Date
                ? a.start.getTime()
                : new Date(a?.start || 0).getTime();
              const bTime = b?.start instanceof Date
                ? b.start.getTime()
                : new Date(b?.start || 0).getTime();
              return aTime - bTime;
            });
            return nextEvents;
          });
        }
        showToast('Événement sauvegardé avec succès');
      } catch (error) {
        console.error('saveEventNew error', error);
        showToast('Erreur lors de la sauvegarde', true);
      } finally {
        closeModal();
      }
    },
    [planningContext, readOnly, modal.readOnly, weekStart, closeModal]
  );

  const handleDeleteEvent = useCallback(
    async (id) => {
      if (!planningContext || readOnly || modal.readOnly) {
        return;
      }
      try {
        await deleteEventNew(planningContext, id);
        showToast('Événement supprimé avec succès');
      } catch (error) {
        console.error('deleteEventNew error', error);
        showToast('Erreur lors de la suppression', true);
      } finally {
        closeModal();
      }
    },
    [planningContext, readOnly, modal.readOnly, closeModal]
  );

  const handleMemberChange = useCallback((event) => {
    const nextMember = event.target.value;
    setSelectedMemberId(nextMember || null);
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentDate((date) =>
      view === 'week'
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7)
        : new Date(date.getFullYear(), date.getMonth() - 1, 1)
    );
  }, [view]);

  const goToNext = useCallback(() => {
    setCurrentDate((date) =>
      view === 'week'
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7)
        : new Date(date.getFullYear(), date.getMonth() + 1, 1)
    );
  }, [view]);

  const currentLabel = view === 'week' ? formatWeekLabel(currentDate) : formatMonthLabel(currentDate);

  const taskSources = weeklyTasks.length ? weeklyTasks : taskOccurrences;

  const showSkeleton = eventsLoading || tasksLoading;

  useEffect(() => {
    if (!isTeamContext) {
      return;
    }
    if (!teamId) {
      return;
    }
    if (!teamMembershipReady) {
      return;
    }
    if (membersError) {
      return;
    }
    if (members.length === 0 && !membersLoading) {
      showToast("Aucun membre trouvé pour cette équipe", true);
    }
  }, [
    isTeamContext,
    teamId,
    teamMembershipReady,
    members,
    membersLoading,
    membersError,
  ]);

  const pageTitle = isTeamContext
    ? teamName || 'Planning équipe'
    : 'Mon planning';

  const subtitle = isTeamContext
    ? 'Consultez et organisez les plannings de votre équipe'
    : 'Gérez vos événements et vos tâches hebdomadaires';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{pageTitle}</h1>
          <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
          {eventsError && (
            <p className="mt-2 text-sm text-red-600">{eventsError}</p>
          )}
          {tasksError && (
            <p className="mt-1 text-sm text-red-600">{tasksError}</p>
          )}
          {membersError && (
            <p className="mt-1 text-sm text-red-600">{membersError}</p>
          )}
        </div>

        {isTeamContext && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label htmlFor="team-member-select" className="text-sm font-medium text-gray-700">
              Voir le planning de :
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select
                id="team-member-select"
                value={selectedMemberId || ''}
                onChange={handleMemberChange}
                disabled={membersLoading || members.length === 0}
                className="rounded-md border border-gray-300 bg-white py-2 px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              >
                {members.map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {buildMemberLabel(member, user)}
                  </option>
                ))}
              </select>
              {readOnly && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  Lecture seule
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <WeekNavigationHeader
          currentLabel={currentLabel}
          onPrev={goToPrevious}
          onNext={goToNext}
          onToday={goToToday}
          view={view}
          onViewChange={setView}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={!readOnly ? () => openCreateModal(new Date()) : undefined}
            disabled={readOnly || !planningContext}
            className={`inline-flex items-center rounded-md border border-transparent px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              readOnly || !planningContext
                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            + Événement
          </button>
          <button
            type="button"
            onClick={!readOnly ? openWeeklyTaskModal : undefined}
            disabled={readOnly || !planningContext}
            className={`inline-flex items-center rounded-md border border-transparent px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              readOnly || !planningContext
                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            + Tâche hebdo
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-green-200" />
            <span>Payé</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-red-200" />
            <span>Impayé</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-orange-200" />
            <span>En attente</span>
          </div>
        </div>

        {view === 'week' ? (
          <PlannerGrid
            events={events}
            tasks={taskSources}
            weekStart={weekStart}
            onSlotSelect={(date) => openCreateModal(date)}
            onAddEvent={(date) => openCreateModal(date)}
            onEventClick={openEventModal}
            onTaskClick={(occurrence) => {
              if (readOnly) return;
              const original = weeklyTasks.find((task) => task.id === occurrence.taskId);
              if (original) {
                setWeeklyTaskModal({ open: true, task: original });
              }
            }}
            isReadOnlyMode={readOnly}
          />
        ) : (
          <MonthGrid
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            onDateSelect={(date) => {
              setView('week');
              setCurrentDate(date);
            }}
            onEventClick={openEventModal}
            onCreateEvent={openCreateModal}
            context={planningContext}
          />
        )}

        {showSkeleton && (
          <div className="mt-4 text-sm text-gray-500">Chargement des données…</div>
        )}
      </div>

      <EventModal
        isOpen={modal.open}
        onClose={closeModal}
        selectedDate={modal.selectedDate}
        event={modal.event}
        readOnly={modal.readOnly || readOnly}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
      />

      <WeeklyTaskModal
        isOpen={weeklyTaskModal.open}
        task={weeklyTaskModal.task}
        onClose={closeWeeklyTaskModal}
        onDelete={!readOnly ? (task) => task?.id && handleDeleteWeeklyTask(task.id) : undefined}
        context={planningContext}
        readOnly={readOnly}
      />
    </div>
  );
}
