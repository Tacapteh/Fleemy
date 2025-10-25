import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PlannerGrid from '../components/PlannerGrid';
import MonthGrid from '../components/MonthGrid';
import WeekNavigationHeader from '../components/WeekNavigationHeader';
import EventModal from '../components/EventModal';
import WeeklyTaskModal from '../components/WeeklyTaskModal';
import useTeam from '../hooks/useTeam';
import useTasks from '../hooks/useTasks';
import useUserWeekSlots from '../hooks/useUserWeekSlots';
import { useSettings } from '../context/SettingsContext';
import { getIcon } from '../icons/registry';
import {
  useFirebaseUser,
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
import { readTeamsCache } from '../utils/teamCache';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DEFAULT_START = '09:00';
const DEFAULT_END = '10:00';
const TaskSummaryRow = ({ iconId, label, price }) => {
  const IconComponent = getIcon(iconId || undefined);

  return (
    <div
      role="listitem"
      tabIndex={0}
      className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-xs text-slate-700 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 dark:bg-slate-900/50 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
      aria-label={`${label} — ${price}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/30 dark:text-sky-200"
          title={label}
        >
          <IconComponent className="h-4 w-4" aria-hidden="true" focusable="false" />
        </span>
        <span className="truncate text-sm">{label}</span>
      </div>
      <span className="flex-shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-50">
        {price}
      </span>
    </div>
  );
};

const matchTeamId = (team, teamId) => {
  if (!team || !teamId) {
    return false;
  }

  return (
    team.team_id === teamId ||
    team.teamId === teamId ||
    team.id === teamId
  );
};

const resolveCachedTeamName = (teamId) => {
  if (!teamId) {
    return null;
  }

  const contextTeamName = typeof contextStore.getTeamName === 'function'
    ? contextStore.getTeamName()
    : null;

  if (contextTeamName) {
    return contextTeamName;
  }

  const cachedTeams = readTeamsCache();
  if (Array.isArray(cachedTeams)) {
    const cachedTeam = cachedTeams.find((team) => matchTeamId(team, teamId));
    if (cachedTeam?.name) {
      return cachedTeam.name;
    }
    if (cachedTeam?.displayName) {
      return cachedTeam.displayName;
    }
    if (cachedTeam?.label) {
      return cachedTeam.label;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const storedName = window.localStorage.getItem('teamName');
      if (storedName) {
        return storedName;
      }
    } catch (storageError) {
      console.warn('Unable to read cached team name from localStorage', storageError);
    }
  }

  return null;
};

const toIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const { settings } = useSettings();
  const { teamId: routeTeamId } = useParams();
  const isTeamContext = Boolean(routeTeamId);
  const teamId = routeTeamId || null;

  const [searchParams, setSearchParams] = useSearchParams();
  const rawViewParam = (searchParams.get('view') || '').toLowerCase();
  const viewParam = rawViewParam === 'month' ? 'month' : 'week';
  const [view, setView] = useState(viewParam);

  useEffect(() => {
    if (view !== viewParam) {
      setView(viewParam);
    }
  }, [viewParam, view]);

  const handleViewChange = useCallback(
    (nextView) => {
      const normalized = nextView === 'month' ? 'month' : 'week';
      if (normalized === viewParam) {
        return;
      }

      const params = new URLSearchParams(searchParams);
      if (normalized === 'week') {
        params.delete('view');
      } else {
        params.set('view', 'month');
      }

      setSearchParams(params, { replace: true });
    },
    [viewParam, searchParams, setSearchParams],
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState(null);

  const [modal, setModal] = useState({ open: false, event: null, selectedDate: null, readOnly: false });
  const [weeklyTaskModal, setWeeklyTaskModal] = useState({ open: false, task: null });

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [teamMembershipReady, setTeamMembershipReady] = useState(!isTeamContext);

  const { team } = useTeam(isTeamContext ? routeTeamId : null);
  const teamName = team?.name || null;

  const cachedTeamName = useMemo(() => {
    if (!isTeamContext || !teamId) {
      return null;
    }
    return resolveCachedTeamName(teamId);
  }, [isTeamContext, teamId]);

  const resolvedTeamName = teamName || cachedTeamName || null;

  const weekStart = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  const weekStartISO = useMemo(() => toIsoDate(weekStart), [weekStart]);
  const weekEndISO = useMemo(() => toIsoDate(weekEnd), [weekEnd]);

  const clientMap = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      if (client && client.id) {
        map.set(client.id, client);
      }
    });
    return map;
  }, [clients]);

  const hourlyRateGlobal = useMemo(() => {
    const numeric = Number(settings?.hourlyRateGlobal);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.round(numeric * 100) / 100;
    }
    return 0;
  }, [settings?.hourlyRateGlobal]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
      }),
    [],
  );

  const resolveStatusCategory = useCallback((status) => {
    if (!status) {
      return 'unpaid';
    }
    const normalized = status.toString().trim().toLowerCase();
    if (!normalized) {
      return 'unpaid';
    }
    if (['not_worked', 'cancelled', 'canceled'].includes(normalized)) {
      return null;
    }
    if (
      [
        'paid',
        'payé',
        'paye',
        'payee',
        'réglé',
        'regle',
        'reglé',
        'reglee',
        'settled',
      ].includes(normalized)
    ) {
      return 'paid';
    }
    if (
      [
        'pending',
        'waiting',
        'awaiting',
        'en attente',
        'en_attente',
        'attente',
        'quote',
        'quote_sent',
        'sent',
        'devis',
        'devis envoyé',
        'devis_envoye',
        'estimate',
        'estimation',
        'waiting_payment',
      ].includes(normalized)
    ) {
      return 'pending';
    }
    if (
      [
        'unpaid',
        'non payé',
        'non_paye',
        'impayé',
        'impaye',
        'overdue',
      ].includes(normalized)
    ) {
      return 'unpaid';
    }
    return 'pending';
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }
    if (isTeamContext && teamId) {
      contextStore.set({ type: 'team', teamId, teamName: resolvedTeamName });
      setTeamContext(teamId);
    } else {
      contextStore.set({ type: 'solo' });
      setTeamContext(null);
    }
  }, [isTeamContext, teamId, resolvedTeamName, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setClients([]);
      setClientsError(null);
      setClientsLoading(false);
      return;
    }

    let cancelled = false;
    setClientsLoading(true);
    setClientsError(null);

    const aggregatedClients = new Map();

    const fetchAllClients = async () => {
      const pageSize = 200;
      let pageIndex = 1;
      let hasMore = true;

      while (hasMore && !cancelled) {
        try {
          const params = new URLSearchParams({
            page: String(pageIndex),
            limit: String(pageSize),
            include_archived: 'false',
          });
          const response = await apiFetch(`/clients?${params.toString()}`, {
            headers: { 'X-User-Id': user.uid },
          });

          const batch = Array.isArray(response?.clients) ? response.clients : [];
          batch.forEach((client) => {
            if (!client || !client.id) {
              return;
            }

            const normalized = {
              ...client,
              use_global_rate:
                typeof client.use_global_rate === 'boolean'
                  ? client.use_global_rate
                  : true,
            };

            const rawCustom =
              normalized.hourly_rate_custom ??
              normalized.hourlyRateCustom ??
              null;
            const parsedCustom = Number(rawCustom);
            normalized.hourly_rate_custom =
              Number.isFinite(parsedCustom) && parsedCustom >= 0
                ? parsedCustom
                : null;

            aggregatedClients.set(client.id, normalized);
          });

          const total = typeof response?.total === 'number' ? response.total : null;
          hasMore = Boolean(response?.has_more) && batch.length > 0;
          if (total !== null && aggregatedClients.size >= total) {
            hasMore = false;
          }
          if (batch.length === 0) {
            hasMore = false;
          }

          pageIndex += 1;
        } catch (error) {
          if (!cancelled) {
            console.error('Planning: unable to load clients', error);
            setClients([]);
            setClientsError("Impossible de charger les clients");
            setClientsLoading(false);
          }
          return;
        }
      }

      if (!cancelled) {
        setClients(Array.from(aggregatedClients.values()));
        setClientsLoading(false);
      }
    };

    fetchAllClients();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

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

  const readOnly = useMemo(() => {
    if (!isTeamContext) {
      return false;
    }
    if (!selectedMemberId || !user?.uid) {
      return true;
    }
    return selectedMemberId !== user.uid;
  }, [isTeamContext, selectedMemberId, user?.uid]);

  const shouldDelayEvents = isTeamContext && !teamMembershipReady;

  const {
    slots: events,
    loading: eventsLoading,
    error: eventsError,
  } = useUserWeekSlots(user?.uid, {
    context: planningContext,
    weekStart,
    weekEnd,
    enabled: !shouldDelayEvents,
  });

  const earningsSummary = useMemo(() => {
    const totals = { paid: 0, pending: 0, unpaid: 0 };
    const sourceEvents = Array.isArray(events) ? events : [];

    sourceEvents.forEach((event) => {
      const startDate =
        event?.start instanceof Date ? event.start : new Date(event?.start);
      const endDate = event?.end instanceof Date ? event.end : new Date(event?.end);

      if (
        !(startDate instanceof Date) ||
        Number.isNaN(startDate.getTime()) ||
        !(endDate instanceof Date) ||
        Number.isNaN(endDate.getTime())
      ) {
        return;
      }

      const durationMs = endDate.getTime() - startDate.getTime();
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return;
      }

      const durationHours = durationMs / (60 * 60 * 1000);
      if (!Number.isFinite(durationHours) || durationHours <= 0) {
        return;
      }

      let rateToApply = 0;
      const clientId = event?.clientId || event?.client_id || null;

      if (clientId) {
        const client =
          (clientId && clientMap.get(clientId)) ||
          (Array.isArray(clients)
            ? clients.find((candidate) => candidate?.id === clientId)
            : null);

        if (client) {
          const usesGlobalRate = client?.useGlobalRate ?? client?.use_global_rate;
          const clientHourlyRate = client?.hourlyRate ?? client?.hourly_rate ?? null;

          if (
            usesGlobalRate === false &&
            Number.isFinite(clientHourlyRate) &&
            clientHourlyRate > 0
          ) {
            rateToApply = clientHourlyRate;
          } else if (usesGlobalRate === true) {
            rateToApply = hourlyRateGlobal;
          } else {
            const clientUsesGlobal =
              typeof usesGlobalRate === 'string'
                ? usesGlobalRate === 'global' || usesGlobalRate === 'true'
                : Boolean(usesGlobalRate);
            if (
              clientUsesGlobal === false &&
              Number.isFinite(clientHourlyRate) &&
              clientHourlyRate > 0
            ) {
              rateToApply = clientHourlyRate;
            } else if (clientUsesGlobal === true) {
              rateToApply = hourlyRateGlobal;
            }
          }
        }
      }

      if (!Number.isFinite(rateToApply) || rateToApply <= 0) {
        const eventRate = Number(event?.hourly_rate ?? event?.hourlyRate);
        if (Number.isFinite(eventRate) && eventRate > 0) {
          rateToApply = eventRate;
        }
      }

      if (!Number.isFinite(rateToApply) || rateToApply <= 0) {
        return;
      }

      const amount = durationHours * rateToApply;
      if (!Number.isFinite(amount) || amount <= 0) {
        return;
      }

      const statusCategory = resolveStatusCategory(event?.status ?? event?.type ?? '');
      if (!statusCategory) {
        return;
      }

      totals[statusCategory] += amount;
    });

    return totals;
  }, [events, clientMap, clients, hourlyRateGlobal, resolveStatusCategory]);

  const summaryCards = useMemo(
    () => [
      {
        key: 'paid',
        label: 'Payé',
        amount: earningsSummary.paid,
        border: 'border-emerald-200/70 dark:border-emerald-500/40',
        background: 'bg-emerald-50 dark:bg-emerald-500/10',
        accent: 'text-emerald-600 dark:text-emerald-300',
      },
      {
        key: 'pending',
        label: 'En attente',
        amount: earningsSummary.pending,
        border: 'border-amber-200/70 dark:border-amber-500/30',
        background: 'bg-amber-50 dark:bg-amber-500/10',
        accent: 'text-amber-600 dark:text-amber-300',
      },
      {
        key: 'unpaid',
        label: 'Non payé',
        amount: earningsSummary.unpaid,
        border: 'border-rose-200/70 dark:border-rose-500/40',
        background: 'bg-rose-50 dark:bg-rose-500/10',
        accent: 'text-rose-600 dark:text-rose-300',
      },
    ],
    [earningsSummary],
  );

  const {
    tasks: weeklyTasks,
    occurrences: taskOccurrences,
    loading: tasksLoading,
    error: tasksError,
  } = useTasks(planningContext, weekStartISO);

  const tasksSummary = useMemo(() => {
    if (!Array.isArray(taskOccurrences) || taskOccurrences.length === 0) {
      return { total: 0, items: [] };
    }

    const items = taskOccurrences
      .map((occurrence) => {
        const rawPrice = occurrence?.price;
        const priceNumber = Number(rawPrice);
        if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
          return null;
        }

        const label =
          typeof occurrence?.label === 'string' && occurrence.label.trim()
            ? occurrence.label.trim()
            : 'Tâche';

        const startDate = occurrence?.startDate instanceof Date ? occurrence.startDate : null;
        const sortValue = startDate ? startDate.getTime() : Number.POSITIVE_INFINITY;

        return {
          id: occurrence.occurrenceId || `${occurrence.taskId || 'task'}-${priceNumber}`,
          icon: occurrence.icon || null,
          label,
          price: priceNumber,
          sortValue,
        };
      })
      .filter(Boolean);

    if (!items.length) {
      return { total: 0, items: [] };
    }

    items.sort((a, b) => {
      if (a.sortValue !== b.sortValue) {
        return a.sortValue - b.sortValue;
      }
      return a.label.localeCompare(b.label, 'fr');
    });

    const total = items.reduce((sum, item) => sum + item.price, 0);

    return {
      total,
      items: items.map(({ id, icon, label, price }) => ({ id, icon, label, price })),
    };
  }, [taskOccurrences]);

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
      const baseDate = date ? new Date(date) : new Date();

      if (!date) {
        baseDate.setHours(9, 0, 0, 0);
      }

      setModal({ open: true, event: null, selectedDate: baseDate, readOnly: false });
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

  const handleWeeklyTaskSaved = useCallback(
    (savedTask) => {
      closeWeeklyTaskModal();

      const rawLabel = typeof savedTask?.label === 'string' ? savedTask.label.trim() : '';
      const message = rawLabel
        ? `Tâche "${rawLabel}" sauvegardée`
        : 'Tâche hebdomadaire sauvegardée';

      showToast(message);
    },
    [closeWeeklyTaskModal]
  );

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

        await saveEventNew(planningContext, payload);
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

  const taskSources = taskOccurrences;

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
    ? resolvedTeamName
      ? `Planning ${resolvedTeamName}`
      : 'Planning équipe'
    : 'Mon planning';

  const subtitle = isTeamContext
    ? 'Consultez et organisez les plannings de votre équipe'
    : 'Gérez vos événements et vos tâches hebdomadaires';

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">{pageTitle}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{subtitle}</p>
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
            <label htmlFor="team-member-select" className="text-sm font-medium text-gray-700 dark:text-slate-200">
              Voir le planning de :
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select
                id="team-member-select"
                value={selectedMemberId || ''}
                onChange={handleMemberChange}
                disabled={membersLoading || members.length === 0}
                className="rounded-md border border-gray-300 bg-white py-2 px-3 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                {members.map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {buildMemberLabel(member, user)}
                  </option>
                ))}
              </select>
              {readOnly && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-slate-800 dark:text-slate-200">
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
          onViewChange={handleViewChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={!readOnly ? () => openCreateModal() : undefined}
            disabled={readOnly || !planningContext}
            className={`inline-flex items-center rounded-md border border-transparent px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              readOnly || !planningContext
                ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'
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
                ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
            }`}
          >
            + Tâche hebdo
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900">
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
              handleViewChange('week');
              setCurrentDate(date);
            }}
            onEventClick={openEventModal}
            onCreateEvent={openCreateModal}
            context={planningContext}
          />
        )}

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Récapitulatif des montants
          </h2>
          {clientsLoading && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Chargement des taux clients…
            </p>
          )}
          {clientsError && !clientsLoading && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400" role="alert">
              {clientsError}
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.key}
                className={`rounded-lg border px-4 py-3 text-sm shadow-sm transition-colors ${card.border} ${card.background}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {card.label}
                </p>
                <p className={`mt-1 text-lg font-semibold ${card.accent}`}>
                  {currencyFormatter.format(card.amount)}
                </p>
              </div>
            ))}
            <div
              className={`rounded-lg border px-4 py-3 text-sm shadow-sm transition-colors ${
                tasksSummary.items.length > 0
                  ? 'border-sky-200/70 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10'
                  : 'border-slate-200/70 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Tâches
              </p>
              <p className="mt-1 text-lg font-semibold text-sky-700 dark:text-sky-300">
                {currencyFormatter.format(tasksSummary.total)}
              </p>
              {tasksSummary.items.length > 0 && (
                <div className="mt-3 space-y-2" role="list">
                  {tasksSummary.items.map((item) => (
                    <TaskSummaryRow
                      key={item.id}
                      iconId={item.icon}
                      label={item.label}
                      price={currencyFormatter.format(item.price)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-6 text-sm text-gray-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-green-200 dark:bg-green-500" />
            <span>Payé</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-red-200 dark:bg-red-500" />
            <span>Impayé</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-orange-200 dark:bg-orange-500" />
            <span>En attente</span>
          </div>
        </div>

        {showSkeleton && (
          <div className="mt-4 text-sm text-gray-500 dark:text-slate-400">Chargement des données…</div>
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
        onSave={handleWeeklyTaskSaved}
        onClose={closeWeeklyTaskModal}
        onDelete={!readOnly ? (task) => task?.id && handleDeleteWeeklyTask(task.id) : undefined}
        context={planningContext}
        readOnly={readOnly}
        weekStartISO={weekStartISO}
      />
    </div>
  );
}
