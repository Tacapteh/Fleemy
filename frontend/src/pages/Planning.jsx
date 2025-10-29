import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PlannerGrid from '../components/PlannerGrid';
import MonthGrid from '../components/MonthGrid';
import WeekNavigationHeader from '../components/WeekNavigationHeader';
import EventModal from '../components/EventModal';
import WeeklyTaskModal from '../components/WeeklyTaskModal';
import DailyTodoPanel from '../components/DailyTodoPanel';
import useTeam from '../hooks/useTeam';
import useTasks from '../hooks/useTasks';
import useUserWeekSlots, { requestWeekSlotsRefresh } from '../hooks/useUserWeekSlots';
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
import { ensureTeamsCache, readTeamsCache } from '../utils/teamCache';
import { SectionHeaderRow, Calendar, StatusSummaryCard } from '../ui';

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

const PRIMARY_ACTION_BUTTON_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-colors transition-shadow duration-150 hover:bg-blue-400 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-slate-900 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-lg disabled:hover:bg-blue-500';

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

const computeInitials = (name, email) => {
  if (typeof name === 'string' && name.trim()) {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length) {
      const initials = parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
      if (initials) {
        return initials;
      }
    }
  }

  if (typeof email === 'string' && email.trim()) {
    const prefix = email.split('@')[0] || '';
    if (prefix) {
      return prefix.slice(0, 2).toUpperCase();
    }
  }

  return '??';
};

const MEMBER_COLOR_CACHE = new Map();

const generateMemberColor = (seed) => {
  const cacheKey = seed || 'member';
  if (MEMBER_COLOR_CACHE.has(cacheKey)) {
    return MEMBER_COLOR_CACHE.get(cacheKey);
  }

  const value = cacheKey.toString();
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 62;
  const lightness = 45;
  const background = `hsl(${hue}deg ${saturation}% ${lightness}%)`;
  const border = `hsl(${hue}deg ${saturation}% ${Math.min(72, lightness + 18)}%)`;
  const color = { background, border, text: '#ffffff' };
  MEMBER_COLOR_CACHE.set(cacheKey, color);
  return color;
};

const TEAM_PLANNING_TAB_PERSONAL = 'personal';
const TEAM_PLANNING_TAB_SHARED = 'team';

const toIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateSafe = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  if (typeof value === 'number') {
    const candidate = new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const candidate = new Date(trimmed);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      const candidate = value.toDate();
      return candidate instanceof Date && !Number.isNaN(candidate.getTime())
        ? candidate
        : null;
    } catch (error) {
      return null;
    }
  }

  return null;
};

const getSlotStartDate = (slot) => {
  if (!slot) {
    return null;
  }
  return (
    toDateSafe(slot.start) ||
    toDateSafe(slot.startTime) ||
    toDateSafe(slot.start_time) ||
    toDateSafe(slot.startDate) ||
    toDateSafe(slot.start_date) ||
    null
  );
};

const getSlotEndDate = (slot) => {
  if (!slot) {
    return null;
  }
  return (
    toDateSafe(slot.end) ||
    toDateSafe(slot.endTime) ||
    toDateSafe(slot.end_time) ||
    toDateSafe(slot.endDate) ||
    toDateSafe(slot.end_date) ||
    null
  );
};

const getSlotRate = (slot) => {
  if (!slot) {
    return null;
  }
  const candidates = [
    slot.hourly_rate,
    slot.hourlyRate,
    slot.rate,
    slot.price_per_hour,
    slot.pricePerHour,
    slot.hourly_rate_value,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
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
  const [planningTab, setPlanningTab] = useState(
    isTeamContext ? TEAM_PLANNING_TAB_SHARED : TEAM_PLANNING_TAB_PERSONAL,
  );

  useEffect(() => {
    if (view !== viewParam) {
      setView(viewParam);
    }
  }, [viewParam, view]);

  useEffect(() => {
    if (planningTab === TEAM_PLANNING_TAB_SHARED && view !== 'week') {
      setView('week');
    }
  }, [planningTab, view]);

  useEffect(() => {
    if (isTeamContext) {
      setPlanningTab(TEAM_PLANNING_TAB_SHARED);
    } else {
      setPlanningTab(TEAM_PLANNING_TAB_PERSONAL);
    }
  }, [isTeamContext]);

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
  const [availableTeams, setAvailableTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState(null);
  const [teamPlanningEntries, setTeamPlanningEntries] = useState([]);
  const [teamPlanningLoading, setTeamPlanningLoading] = useState(false);
  const [teamPlanningError, setTeamPlanningError] = useState(null);
  const [teamPlanningRefreshToken, setTeamPlanningRefreshToken] = useState(0);
  const requestTeamPlanningRefresh = useCallback(() => {
    setTeamPlanningRefreshToken((token) => token + 1);
  }, []);

  const { team } = useTeam(isTeamContext ? routeTeamId : null);
  const teamName = team?.name || null;

  const cachedTeamName = useMemo(() => {
    if (!isTeamContext || !teamId) {
      return null;
    }
    return resolveCachedTeamName(teamId);
  }, [isTeamContext, teamId]);

  const resolvedTeamName = teamName || cachedTeamName || null;

  const resolvedTeamFromList = useMemo(() => {
    if (!Array.isArray(availableTeams) || availableTeams.length === 0) {
      return null;
    }
    if (isTeamContext && teamId) {
      const matched = availableTeams.find((candidate) => matchTeamId(candidate, teamId));
      if (matched) {
        return matched;
      }
    }
    return availableTeams[0] || null;
  }, [availableTeams, isTeamContext, teamId]);

  const sharedTeamId = useMemo(() => {
    if (!isTeamContext) {
      return null;
    }
    if (teamId) {
      return teamId;
    }
    if (resolvedTeamFromList) {
      return (
        resolvedTeamFromList.team_id ||
        resolvedTeamFromList.teamId ||
        resolvedTeamFromList.id ||
        null
      );
    }
    return null;
  }, [isTeamContext, teamId, resolvedTeamFromList]);

  const sharedTeamName = useMemo(() => {
    if (!isTeamContext) {
      return null;
    }
    if (resolvedTeamName) {
      return resolvedTeamName;
    }
    if (!resolvedTeamFromList) {
      return null;
    }
    return (
      resolvedTeamFromList.name ||
      resolvedTeamFromList.displayName ||
      resolvedTeamFromList.label ||
      null
    );
  }, [isTeamContext, resolvedTeamName, resolvedTeamFromList]);

  useEffect(() => {
    if (planningTab === TEAM_PLANNING_TAB_SHARED && !sharedTeamId) {
      setPlanningTab(TEAM_PLANNING_TAB_PERSONAL);
    }
  }, [planningTab, sharedTeamId]);

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
      setAvailableTeams([]);
      setTeamsLoading(false);
      setTeamsError(null);
      return;
    }

    let cancelled = false;
    setTeamsLoading(true);
    setTeamsError(null);

    ensureTeamsCache(() => apiFetch('/teams/my'))
      .then((result) => {
        if (cancelled) {
          return;
        }
        const teamsList = Array.isArray(result?.teams) ? result.teams : [];
        setAvailableTeams(teamsList);
        setTeamsLoading(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('Planning: unable to load teams', error);
        setAvailableTeams([]);
        setTeamsError("Impossible de charger les équipes");
        setTeamsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

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

  useEffect(() => {
    if (planningTab !== TEAM_PLANNING_TAB_SHARED) {
      setTeamPlanningLoading(false);
      setTeamPlanningError(null);
      return;
    }

    if (!sharedTeamId) {
      setTeamPlanningEntries([]);
      setTeamPlanningLoading(false);
      setTeamPlanningError(null);
      return;
    }

    let cancelled = false;
    setTeamPlanningLoading(true);
    setTeamPlanningError(null);

    const loadPlanning = async () => {
      try {
        const response = await apiFetch(`/teams/${sharedTeamId}/planning`);
        if (cancelled) {
          return;
        }
        const entries = Array.isArray(response?.entries) ? response.entries : [];
        const normalized = entries
          .map((entry) => {
            const startDate = entry?.start ? new Date(entry.start) : null;
            const endDate = entry?.end ? new Date(entry.end) : null;
            if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
              return null;
            }
            return {
              ...entry,
              start: startDate,
              end: endDate,
              createdByInitials:
                entry?.createdByInitials || computeInitials(entry?.createdByName, entry?.createdBy),
            };
          })
          .filter(Boolean);
        setTeamPlanningEntries(normalized);
        setTeamPlanningLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error('team planning load error', error);
        setTeamPlanningEntries([]);
        setTeamPlanningLoading(false);
        setTeamPlanningError("Impossible de charger le planning d'équipe");
      }
    };

    loadPlanning();

    return () => {
      cancelled = true;
    };
  }, [planningTab, sharedTeamId, teamPlanningRefreshToken, weekStartISO]);

  const planningContext = useMemo(() => {
    if (!user?.uid) {
      return null;
    }
    if (planningTab === TEAM_PLANNING_TAB_SHARED) {
      if (!sharedTeamId) {
        return null;
      }
      return { type: 'team-shared', teamId: sharedTeamId, userId: user.uid };
    }
    if (isTeamContext) {
      if (!teamMembershipReady || !teamId || !selectedMemberId) {
        return null;
      }
      return { type: 'team', teamId, memberUid: selectedMemberId };
    }
    return { type: 'personal', userId: user.uid };
  }, [
    planningTab,
    sharedTeamId,
    isTeamContext,
    teamMembershipReady,
    teamId,
    selectedMemberId,
    user?.uid,
  ]);

  const readOnly = useMemo(() => {
    if (planningTab === TEAM_PLANNING_TAB_SHARED) {
      return false;
    }
    if (!isTeamContext) {
      return false;
    }
    if (!selectedMemberId || !user?.uid) {
      return true;
    }
    return selectedMemberId !== user.uid;
  }, [planningTab, isTeamContext, selectedMemberId, user?.uid]);

  const shouldDelayEvents = planningTab !== TEAM_PLANNING_TAB_SHARED && isTeamContext && !teamMembershipReady;

  const {
    slots: events,
    loading: eventsLoading,
    error: eventsError,
  } = useUserWeekSlots(user?.uid, {
    context: planningContext,
    weekStart,
    weekEnd,
    enabled: planningTab !== TEAM_PLANNING_TAB_SHARED && !shouldDelayEvents,
  });

  const calculateRecapTotals = useCallback(
    (slotsList, taskList, hourlyRateValue) => {
      const totals = {
        totalPaye: 0,
        totalEnAttente: 0,
        totalNonPaye: 0,
        totalTaches: 0,
      };

      const countedTaskIds = new Set();
      const numericGlobalRate = Number(hourlyRateValue);
      const globalRate =
        Number.isFinite(numericGlobalRate) && numericGlobalRate > 0 ? numericGlobalRate : 0;

      const slotsArray = Array.isArray(slotsList) ? slotsList : [];

      slotsArray.forEach((slot) => {
        if (!slot || typeof slot !== 'object') {
          return;
        }

        const normalizedType =
          typeof slot.type === 'string' ? slot.type.trim().toLowerCase() : '';

        if (normalizedType === 'absence') {
          return;
        }

        const rawStatusCandidates = [
          slot?.payment_status,
          slot?.paymentStatus,
          slot?.status,
          slot?.state,
          slot?.type,
        ];

        let explicitStatus = null;
        for (const candidate of rawStatusCandidates) {
          if (candidate === undefined || candidate === null) {
            continue;
          }
          if (typeof candidate === 'string') {
            const normalized = candidate.trim().toLowerCase();
            if (!normalized) {
              continue;
            }
            if (['task', 'weekly_task', 'weekly-task', 'absence'].includes(normalized)) {
              continue;
            }
          }
          explicitStatus = candidate;
          break;
        }

        const normalizedSource =
          typeof slot?.source === 'string' ? slot.source.trim().toLowerCase() : '';
        const normalizedKind =
          typeof slot?.kind === 'string' ? slot.kind.trim().toLowerCase() : '';

        const explicitWeeklyTask =
          slot?.weekly === true ||
          slot?.isWeeklyTask === true ||
          slot?.is_task === true ||
          normalizedSource === 'weekly_task' ||
          normalizedKind === 'weekly_task' ||
          normalizedType === 'task' ||
          normalizedType === 'weekly_task' ||
          normalizedType === 'weekly-task' ||
          typeof slot?.weekly_task_id === 'string' ||
          typeof slot?.weeklyTaskId === 'string' ||
          typeof slot?.task_id === 'string' ||
          typeof slot?.taskId === 'string' ||
          typeof slot?.weekly_task_occurrence_id === 'string' ||
          typeof slot?.weeklyTaskOccurrenceId === 'string' ||
          typeof slot?.task_occurrence_id === 'string' ||
          typeof slot?.taskOccurrenceId === 'string';

        const taskLabel = (() => {
          if (typeof slot?.task_label === 'string' && slot.task_label.trim()) {
            return slot.task_label.trim();
          }
          if (typeof slot?.taskLabel === 'string' && slot.taskLabel.trim()) {
            return slot.taskLabel.trim();
          }
          if (typeof slot?.task_name === 'string' && slot.task_name.trim()) {
            return slot.task_name.trim();
          }
          if (typeof slot?.taskName === 'string' && slot.taskName.trim()) {
            return slot.taskName.trim();
          }
          return '';
        })();

        const hasClientSignal = Boolean(
          (typeof slot?.client === 'string' && slot.client.trim()) ||
            (slot?.client && typeof slot.client === 'object') ||
            (typeof slot?.client_name === 'string' && slot.client_name.trim()) ||
            (typeof slot?.clientName === 'string' && slot.clientName.trim()) ||
            (typeof slot?.client_label === 'string' && slot.client_label.trim()) ||
            (typeof slot?.clientLabel === 'string' && slot.clientLabel.trim()) ||
            (typeof slot?.client_id === 'string' && slot.client_id.trim()) ||
            (typeof slot?.clientId === 'string' && slot.clientId.trim()),
        );

        const slotRateCandidate = getSlotRate(slot);
        const hasRate = Number.isFinite(slotRateCandidate) && slotRateCandidate > 0;

        const hasExplicitStatus = Boolean(explicitStatus);

        const looksLikeStandaloneTask =
          (explicitWeeklyTask || Boolean(taskLabel)) &&
          !hasClientSignal &&
          !hasRate &&
          !hasExplicitStatus;

        if (looksLikeStandaloneTask) {
          const taskPriceCandidates = [
            slot?.task_price,
            slot?.taskPrice,
            slot?.price,
            slot?.flat_price,
            slot?.flatPrice,
            slot?.fixed_price,
            slot?.fixedPrice,
            slot?.amount,
          ];
          for (const candidate of taskPriceCandidates) {
            const numeric = Number(candidate);
            if (Number.isFinite(numeric) && numeric > 0) {
              totals.totalTaches += numeric;
              const taskIdentifier =
                slot?.task_occurrence_id ||
                slot?.taskOccurrenceId ||
                slot?.weekly_task_occurrence_id ||
                slot?.weeklyTaskOccurrenceId ||
                slot?.task_id ||
                slot?.taskId ||
                slot?.id ||
                null;
              if (taskIdentifier) {
                countedTaskIds.add(String(taskIdentifier));
              }
              break;
            }
          }
          return;
        }

        if (!hasClientSignal && !hasRate && !hasExplicitStatus) {
          return;
        }

        const startDate = getSlotStartDate(slot);
        const endDate = getSlotEndDate(slot);

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

        let rateToApply = null;

        const clientId = slot?.clientId || slot?.client_id || null;
        let resolvedClient = null;

        if (clientId) {
          resolvedClient =
            clientMap.get(clientId) ||
            (Array.isArray(clients)
              ? clients.find((candidate) => candidate?.id === clientId)
              : null);
        }

        if (!resolvedClient && slot?.client && typeof slot.client === 'object') {
          resolvedClient = slot.client;
        }

        if (resolvedClient) {
          const usesGlobalRate = resolvedClient?.useGlobalRate ?? resolvedClient?.use_global_rate;
          const clientHourlyRate =
            resolvedClient?.hourlyRate ??
            resolvedClient?.hourly_rate ??
            resolvedClient?.hourly_rate_custom ??
            resolvedClient?.hourlyRateCustom ??
            null;

          const parsedClientRate = Number(clientHourlyRate);
          const normalizedUseGlobal =
            typeof usesGlobalRate === 'string'
              ? ['global', 'true'].includes(usesGlobalRate.trim().toLowerCase())
              : usesGlobalRate;

          if (normalizedUseGlobal === false && Number.isFinite(parsedClientRate) && parsedClientRate > 0) {
            rateToApply = parsedClientRate;
          } else if (normalizedUseGlobal === true) {
            if (globalRate > 0) {
              rateToApply = globalRate;
            }
          } else if (Number.isFinite(parsedClientRate) && parsedClientRate > 0) {
            rateToApply = parsedClientRate;
          }
        }

        if (!Number.isFinite(rateToApply) || rateToApply <= 0) {
          if (globalRate > 0) {
            rateToApply = globalRate;
          }
        }

        if (!Number.isFinite(rateToApply) || rateToApply <= 0) {
          if (Number.isFinite(slotRateCandidate) && slotRateCandidate > 0) {
            rateToApply = slotRateCandidate;
          }
        }

        if (!Number.isFinite(rateToApply) || rateToApply <= 0) {
          return;
        }

        const amount = durationHours * rateToApply;
        if (!Number.isFinite(amount) || amount <= 0) {
          return;
        }

        const statusCategory = resolveStatusCategory(
          explicitStatus ?? slot?.payment_status ?? slot?.status ?? slot?.type ?? '',
        );
        if (!statusCategory) {
          return;
        }

        if (statusCategory === 'paid') {
          totals.totalPaye += amount;
        } else if (statusCategory === 'pending') {
          totals.totalEnAttente += amount;
        } else if (statusCategory === 'unpaid') {
          totals.totalNonPaye += amount;
        }
      });

      const occurrences = Array.isArray(taskList) ? taskList : [];
      occurrences.forEach((occurrence) => {
        if (!occurrence) {
          return;
        }

        const occurrenceId =
          occurrence.occurrenceId ||
          occurrence.id ||
          (occurrence.taskId
            ? `${occurrence.taskId}-${occurrence.taskDateISO || occurrence.task_date_iso || ''}`
            : null);

        if (occurrenceId && countedTaskIds.has(String(occurrenceId))) {
          return;
        }

        const price = Number(occurrence.price);
        if (Number.isFinite(price) && price > 0) {
          totals.totalTaches += price;
          if (occurrenceId) {
            countedTaskIds.add(String(occurrenceId));
          }
        }
      });

      return totals;
    },
    [clientMap, clients, resolveStatusCategory],
  );

  const effectiveTasksContext = planningTab === TEAM_PLANNING_TAB_SHARED ? null : planningContext;

  const {
    tasks: weeklyTasks,
    occurrences: taskOccurrences,
    loading: tasksLoading,
    error: tasksError,
  } = useTasks(effectiveTasksContext, weekStartISO);

  const teamEntriesForWeek = useMemo(() => {
    if (planningTab !== TEAM_PLANNING_TAB_SHARED) {
      return [];
    }
    if (!Array.isArray(teamPlanningEntries) || teamPlanningEntries.length === 0) {
      return [];
    }
    const startTime = weekStart.getTime();
    const endTime = weekEnd.getTime();

    return teamPlanningEntries
      .map((entry) => {
        const startDate = entry.start instanceof Date ? entry.start : new Date(entry.start);
        const endDate = entry.end instanceof Date ? entry.end : new Date(entry.end);
        if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
          return null;
        }
        return {
          ...entry,
          start: startDate,
          end: endDate,
          createdByInitials: entry.createdByInitials || computeInitials(entry.createdByName, entry.createdBy),
        };
      })
      .filter((entry) => {
        if (!entry) {
          return false;
        }
        const startDate = entry.start;
        const time = startDate.getTime();
        return time >= startTime && time <= endTime;
      });
  }, [planningTab, teamPlanningEntries, weekStart, weekEnd]);

  const teamEventBlocks = useMemo(() => {
    if (!teamEntriesForWeek.length) {
      return [];
    }
    return teamEntriesForWeek.filter((entry) => (entry?.type || 'event').toLowerCase() !== 'task');
  }, [teamEntriesForWeek]);

  const teamTaskBlocks = useMemo(() => {
    if (!teamEntriesForWeek.length) {
      return [];
    }
    return teamEntriesForWeek.filter((entry) => (entry?.type || '').toLowerCase() === 'task');
  }, [teamEntriesForWeek]);

  const teamEventsMerged = useMemo(() => {
    if (!teamEventBlocks.length) {
      return [];
    }
    const groups = new Map();
    teamEventBlocks.forEach((entry) => {
      const startKey = entry.start.toISOString();
      const endKey = entry.end.toISOString();
      const key = `${startKey}|${endKey}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(entry);
    });

    const merged = [];
    groups.forEach((list) => {
      const sorted = [...list].sort((a, b) => {
        const diff = a.start.getTime() - b.start.getTime();
        if (diff !== 0) {
          return diff;
        }
        return (a.createdByName || '').localeCompare(b.createdByName || '');
      });
      const base = sorted[0];
      const participants = sorted.map((item) => {
        const color = generateMemberColor(item.createdBy || item.createdByName || item.createdByInitials || 'member');
        return {
          id: item.createdBy || item.id,
          name: item.createdByName || 'Membre',
          initials: item.createdByInitials || computeInitials(item.createdByName, item.createdBy),
          background: color.background,
          border: color.border,
          text: color.text,
        };
      });
      const tooltipDetails = sorted.map((item) => `${item.title || 'Bloc'} — ${item.createdByName || 'Membre'}`);
      merged.push({
        ...base,
        teamParticipants: participants,
        teamMerged: sorted.length > 1,
        teamMergedEntries: sorted,
        teamMergedTooltip: tooltipDetails.join('\n'),
      });
    });

    return merged;
  }, [teamEventBlocks]);

  const teamTaskOccurrences = useMemo(() => {
    if (!teamTaskBlocks.length) {
      return [];
    }
    const weekStartMs = weekStart.getTime();
    const msInDay = 24 * 60 * 60 * 1000;

    return teamTaskBlocks
      .map((task) => {
        const startDate = task.start;
        const endDate = task.end;
        if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
          return null;
        }
        if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
          return null;
        }
        const rawDayIndex = Math.floor((startDate.getTime() - weekStartMs) / msInDay);
        const dayIndex = Math.min(6, Math.max(0, rawDayIndex));
        const color = generateMemberColor(task.createdBy || task.createdByName || task.id);
        return {
          taskId: task.id,
          occurrenceId: task.id,
          dayIndex,
          startDate,
          endDate,
          label: task.title || 'Tâche',
          color: task.color || color.background,
          price: typeof task.price === 'number' ? task.price : null,
          icon: task.icon || null,
          readOnly: false,
          teamParticipants: [
            {
              id: task.createdBy || task.id,
              name: task.createdByName || 'Membre',
              initials: task.createdByInitials || computeInitials(task.createdByName, task.createdBy),
              background: color.background,
              border: color.border,
              text: color.text,
            },
          ],
        };
      })
      .filter(Boolean);
  }, [teamTaskBlocks, weekStart]);

  const activeEvents = useMemo(() => {
    if (planningTab === TEAM_PLANNING_TAB_SHARED) {
      return teamEventsMerged;
    }
    return events;
  }, [planningTab, teamEventsMerged, events]);

  const activeTaskOccurrences = useMemo(() => {
    if (planningTab === TEAM_PLANNING_TAB_SHARED) {
      return teamTaskOccurrences;
    }
    return taskOccurrences;
  }, [planningTab, teamTaskOccurrences, taskOccurrences]);

  const activeWeeklyTasks = planningTab === TEAM_PLANNING_TAB_SHARED ? [] : weeklyTasks;
  const recapTotals = useMemo(
    () => calculateRecapTotals(activeEvents, activeTaskOccurrences, hourlyRateGlobal),
    [calculateRecapTotals, activeEvents, activeTaskOccurrences, hourlyRateGlobal],
  );

  const summaryCards = useMemo(
    () => [
      {
        key: 'paid',
        label: 'Payé',
        amount: recapTotals.totalPaye,
        border: 'border-emerald-200/70 dark:border-emerald-500/40',
        background: 'bg-emerald-50 dark:bg-emerald-500/10',
        accent: 'text-emerald-600 dark:text-emerald-300',
      },
      {
        key: 'pending',
        label: 'En attente',
        amount: recapTotals.totalEnAttente,
        border: 'border-amber-200/70 dark:border-amber-500/30',
        background: 'bg-amber-50 dark:bg-amber-500/10',
        accent: 'text-amber-600 dark:text-amber-300',
      },
      {
        key: 'unpaid',
        label: 'Non payé',
        amount: recapTotals.totalNonPaye,
        border: 'border-rose-200/70 dark:border-rose-500/40',
        background: 'bg-rose-50 dark:bg-rose-500/10',
        accent: 'text-rose-600 dark:text-rose-300',
      },
    ],
    [recapTotals],
  );

  const tasksSummary = useMemo(() => {
    if (!Array.isArray(activeTaskOccurrences) || activeTaskOccurrences.length === 0) {
      return { total: 0, items: [] };
    }

    const items = activeTaskOccurrences
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
  }, [activeTaskOccurrences]);

  const handleDeleteWeeklyTask = useCallback(
    async (taskId) => {
      if (readOnly) {
        return;
      }
      if (planningTab === TEAM_PLANNING_TAB_SHARED) {
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
    [planningContext, planningTab, readOnly]
  );

  useEffect(() => {
    const cleanupFns = [];

    const unsubscribeOpen = subscribeToUIEvent('openTaskModal', (taskId) => {
      if (readOnly) {
        return;
      }
      if (!taskId) return;
      const original = activeWeeklyTasks.find((task) => task.id === taskId);
      if (original) {
        setWeeklyTaskModal({ open: true, task: original });
      }
    });

    const unsubscribeDelete = subscribeToUIEvent('confirmDeleteTask', (taskId) => {
      if (readOnly) {
        return;
      }
      const original = activeWeeklyTasks.find((task) => task.id === taskId);
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
  }, [activeWeeklyTasks, planningTab, readOnly, handleDeleteWeeklyTask]);

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
    if (readOnly || !planningContext || planningTab === TEAM_PLANNING_TAB_SHARED) return;
    setWeeklyTaskModal({ open: true, task: null });
  }, [readOnly, planningContext, planningTab]);

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
      if (!data) {
        return;
      }

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

      const rawType = typeof data.type === 'string' ? data.type.trim().toLowerCase() : '';
      const eventType = rawType === 'absence' ? 'absence' : 'normal';

      const paymentStatusCandidates = [data.payment_status, data.status, data.paymentStatus];
      let resolvedStatus = eventType === 'absence' ? 'not_worked' : 'unpaid';
      for (const candidate of paymentStatusCandidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          resolvedStatus = candidate.trim();
          break;
        }
      }

      const shouldClearClient = eventType === 'absence';
      const sanitizedClientId = shouldClearClient ? '' : data.client_id || '';
      const sanitizedClientName = shouldClearClient ? '' : data.client_name || '';
      const resolvedTitle = data.description || data.title || sanitizedClientName || 'Bloc';

      if (planningTab === TEAM_PLANNING_TAB_SHARED) {
        if (!user?.uid || !sharedTeamId) {
          closeModal();
          return;
        }

        try {
          const teamPayload = {
            id: data.id || data.teamPlanningId || data.team_planning_id || null,
            title: resolvedTitle,
            type: 'event',
            start: start.toISOString(),
            end: end.toISOString(),
            status: resolvedStatus,
            color: data.color || '#2563eb',
            price: Number.isFinite(Number(data.price)) ? Number(data.price) : null,
            createdBy: user.uid,
            createdByName: user.displayName || user.email || 'Moi',
            createdByInitials: computeInitials(user.displayName, user.email),
            teamId: sharedTeamId,
            synced: Boolean(data.synced),
            personalEventId: data.personalEventId || data.id || null,
          };

          const response = await apiFetch(`/teams/${sharedTeamId}/planning`, {
            method: 'POST',
            body: JSON.stringify(teamPayload),
          });

          requestTeamPlanningRefresh();

          if (!data.synced) {
            const personalPayload = {
              id: data.personalEventId || data.id || null,
              start: start.toISOString(),
              end: end.toISOString(),
              type: eventType,
              client: shouldClearClient ? '' : sanitizedClientName || resolvedTitle,
              status: resolvedStatus,
              payment_status: resolvedStatus,
              hourly_rate: shouldClearClient ? 0 : data.hourly_rate || 50,
              duration: Math.round((end - start) / (60 * 1000)),
              task_id: shouldClearClient ? null : data.task_id || null,
              description: data.description || '',
              client_id: sanitizedClientId,
              client_name: sanitizedClientName,
              day: DAY_KEYS[dayIndex] || 'monday',
              team_planning_id: response?.entry?.id || teamPayload.id || null,
              synced: true,
            };

            let syncedPersonalId = personalPayload.id || null;
            try {
              const syncedEvent = await saveEventNew(
                { type: 'personal', userId: user.uid },
                personalPayload,
              );
              syncedPersonalId = syncedEvent?.id || personalPayload.id || null;
              requestWeekSlotsRefresh({ type: 'personal', userId: user.uid }, weekStart, weekEnd);
            } catch (syncError) {
              console.warn('Unable to synchronise personal planning from team event', syncError);
            }

            if (syncedPersonalId && response?.entry?.id) {
              try {
                await apiFetch(`/teams/${sharedTeamId}/planning`, {
                  method: 'POST',
                  body: JSON.stringify({
                    id: response.entry.id,
                    title: resolvedTitle,
                    type: 'event',
                    start: start.toISOString(),
                    end: end.toISOString(),
                    status: resolvedStatus,
                    color: data.color || '#2563eb',
                    price: Number.isFinite(Number(data.price)) ? Number(data.price) : null,
                    createdBy: user.uid,
                    createdByName: user.displayName || user.email || 'Moi',
                    createdByInitials: computeInitials(user.displayName, user.email),
                    teamId: sharedTeamId,
                    synced: true,
                    personalEventId: syncedPersonalId,
                  }),
                });
              } catch (linkError) {
                console.warn('Unable to associer le bloc équipe à votre événement personnel', linkError);
              }
            }
          }

          showToast("Bloc d'équipe enregistré avec succès");
        } catch (error) {
          console.error('team planning save error', error);
          showToast("Impossible d'enregistrer le bloc d'équipe", true);
        } finally {
          closeModal();
        }
        return;
      }

      if (!planningContext || readOnly || modal.readOnly) {
        return;
      }

      try {
        const payload = {
          id: data.id,
          start: start.toISOString(),
          end: end.toISOString(),
          type: eventType,
          client: shouldClearClient ? '' : sanitizedClientName || resolvedTitle,
          status: resolvedStatus,
          payment_status: resolvedStatus,
          hourly_rate: shouldClearClient ? 0 : data.hourly_rate || 50,
          duration: Math.round((end - start) / (60 * 1000)),
          task_id: shouldClearClient ? null : data.task_id || null,
          description: data.description || '',
          client_id: sanitizedClientId,
          client_name: sanitizedClientName,
          day: DAY_KEYS[dayIndex] || 'monday',
          team_planning_id: data.teamPlanningId || data.team_planning_id || null,
          synced: Boolean(data.synced),
        };

        const savedEvent = await saveEventNew(planningContext, payload);
        requestWeekSlotsRefresh(planningContext, weekStart, weekEnd);
        const savedPersonalId = savedEvent?.id || payload.id || null;

        if (sharedTeamId && !data.synced) {
          try {
            const teamPayload = {
              id: data.teamPlanningId || data.team_planning_id || null,
              title: resolvedTitle,
              type: 'event',
              start: start.toISOString(),
              end: end.toISOString(),
              status: resolvedStatus,
              color: data.color || '#2563eb',
              price: Number.isFinite(Number(data.price)) ? Number(data.price) : null,
              createdBy: user?.uid || null,
              createdByName: user?.displayName || user?.email || 'Moi',
              createdByInitials: computeInitials(user?.displayName, user?.email),
              teamId: sharedTeamId,
              synced: true,
              personalEventId: savedPersonalId || data.id || null,
            };

            const response = await apiFetch(`/teams/${sharedTeamId}/planning`, {
              method: 'POST',
              body: JSON.stringify(teamPayload),
            });

            if (response?.entry?.id && savedPersonalId) {
              try {
                await saveEventNew(planningContext, {
                  id: savedPersonalId,
                  team_planning_id: response.entry.id,
                  synced: true,
                });
              } catch (attachError) {
                console.warn('Unable to attach team planning identifier to event', attachError);
              }
            }

            requestTeamPlanningRefresh();
          } catch (teamSyncError) {
            console.error('team planning sync error', teamSyncError);
          }
        }

        showToast('Événement sauvegardé avec succès');
      } catch (error) {
        console.error('saveEventNew error', error);
        showToast('Erreur lors de la sauvegarde', true);
      } finally {
        closeModal();
      }
    },
    [
      planningContext,
      planningTab,
      readOnly,
      modal.readOnly,
      weekStart,
      weekEnd,
      requestWeekSlotsRefresh,
      requestTeamPlanningRefresh,
      closeModal,
      sharedTeamId,
      user?.uid,
      user?.displayName,
      user?.email,
    ]
  );

  const handleDeleteEvent = useCallback(
    async (id) => {
      if (!id) {
        return;
      }

      if (planningTab === TEAM_PLANNING_TAB_SHARED) {
        if (!sharedTeamId) {
          closeModal();
          return;
        }
        try {
          await apiFetch(`/teams/${sharedTeamId}/planning/${id}`, { method: 'DELETE' });
          requestTeamPlanningRefresh();

          const personalId = modal.event?.personalEventId || modal.event?.team_planning_id || null;
          if (personalId && user?.uid) {
            try {
              await deleteEventNew({ type: 'personal', userId: user.uid }, personalId);
              requestWeekSlotsRefresh({ type: 'personal', userId: user.uid }, weekStart, weekEnd);
            } catch (personalError) {
              console.warn('Unable to delete personal event linked to team block', personalError);
            }
          }

          showToast("Bloc d'équipe supprimé");
        } catch (error) {
          console.error('team planning delete error', error);
          showToast("Impossible de supprimer le bloc d'équipe", true);
        } finally {
          closeModal();
        }
        return;
      }

      if (!planningContext || readOnly || modal.readOnly) {
        return;
      }
      try {
        await deleteEventNew(planningContext, id);
        requestWeekSlotsRefresh(planningContext, weekStart, weekEnd);
        showToast('Événement supprimé avec succès');
      } catch (error) {
        console.error('deleteEventNew error', error);
        showToast('Erreur lors de la suppression', true);
      } finally {
        closeModal();
      }
    },
    [
      planningContext,
      planningTab,
      readOnly,
      modal.readOnly,
      modal.event,
      weekStart,
      weekEnd,
      requestWeekSlotsRefresh,
      requestTeamPlanningRefresh,
      closeModal,
      sharedTeamId,
      user?.uid,
    ]
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

  const taskSources = activeTaskOccurrences;

  const showSkeleton =
    planningTab === TEAM_PLANNING_TAB_SHARED
      ? teamPlanningLoading
      : eventsLoading || tasksLoading;

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

  const pageTitle = planningTab === TEAM_PLANNING_TAB_SHARED
    ? sharedTeamName
      ? `Planning ${sharedTeamName}`
      : 'Planning d’équipe'
    : isTeamContext && resolvedTeamName
      ? `Planning ${resolvedTeamName}`
      : 'Mon planning';

  const subtitle = planningTab === TEAM_PLANNING_TAB_SHARED
    ? 'Planifiez les créneaux partagés de votre équipe en temps réel'
    : isTeamContext
      ? 'Consultez et organisez les plannings de votre équipe'
      : 'Gérez vos événements et vos tâches hebdomadaires';

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <header className="space-y-2">
          <SectionHeaderRow
            headingLevel={1}
            icon={
              <Calendar aria-hidden="true" className="h-6 w-6" />
            }
            iconClassName="text-gray-900 dark:text-slate-100"
            title={pageTitle}
            titleClassName="text-2xl font-semibold text-gray-900 dark:text-slate-100"
            className="items-start gap-3"
          />
          <p className="text-sm text-gray-600 dark:text-slate-300">{subtitle}</p>
          {eventsError && planningTab !== TEAM_PLANNING_TAB_SHARED && (
            <p className="text-sm text-red-600">{eventsError}</p>
          )}
          {tasksError && planningTab !== TEAM_PLANNING_TAB_SHARED && (
            <p className="text-sm text-red-600">{tasksError}</p>
          )}
          {teamPlanningError && planningTab === TEAM_PLANNING_TAB_SHARED && (
            <p className="text-sm text-red-600">{teamPlanningError}</p>
          )}
          {membersError && (
            <p className="text-sm text-red-600">{membersError}</p>
          )}
        </header>

        {isTeamContext &&
          (sharedTeamId || (Array.isArray(availableTeams) && availableTeams.length > 0)) && (
          <div
            role="tablist"
            aria-label="Mode de planning"
            className="mt-3 flex w-full flex-wrap gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/60 sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={planningTab === TEAM_PLANNING_TAB_PERSONAL}
              onClick={() => setPlanningTab(TEAM_PLANNING_TAB_PERSONAL)}
              className={`flex-1 min-w-[140px] rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-none ${
                planningTab === TEAM_PLANNING_TAB_PERSONAL
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'bg-transparent text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/40'
              }`}
            >
              Mon planning
            </button>
            {sharedTeamId && (
              <button
                type="button"
                role="tab"
                aria-selected={planningTab === TEAM_PLANNING_TAB_SHARED}
                onClick={() => setPlanningTab(TEAM_PLANNING_TAB_SHARED)}
                disabled={!sharedTeamId}
                aria-disabled={!sharedTeamId}
                className={`flex-1 min-w-[140px] rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-none ${
                  planningTab === TEAM_PLANNING_TAB_SHARED
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'bg-transparent text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/40'
                } ${sharedTeamId ? '' : 'cursor-not-allowed opacity-60'}`}
              >
                Planning d'équipe
              </button>
            )}
          </div>
        )}

        {teamsError && (
          <p className="mt-2 text-sm text-red-600">{teamsError}</p>
        )}

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
            className={PRIMARY_ACTION_BUTTON_CLASSES}
          >
            + Événement
          </button>
          <button
            type="button"
            onClick={!readOnly && planningTab !== TEAM_PLANNING_TAB_SHARED ? openWeeklyTaskModal : undefined}
            disabled={
              readOnly ||
              !planningContext ||
              planningTab === TEAM_PLANNING_TAB_SHARED
            }
            className={PRIMARY_ACTION_BUTTON_CLASSES}
          >
            + Tâche hebdo
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg shadow-slate-900/10 transition-colors transition-shadow duration-200 dark:border-slate-800 dark:bg-slate-900">
        {view === 'week' ? (
          <PlannerGrid
            events={activeEvents}
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
            context={planningTab === TEAM_PLANNING_TAB_SHARED ? null : planningContext}
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
            <StatusSummaryCard
              variant="success"
              label="Payé"
              amount={currencyFormatter.format(recapTotals.totalPaye)}
              data-testid="planning-recap-paid"
            />
            <StatusSummaryCard
              variant="warning"
              label="En attente"
              amount={currencyFormatter.format(recapTotals.totalEnAttente)}
              data-testid="planning-recap-pending"
            />
            <StatusSummaryCard
              variant="danger"
              label="Non payé"
              amount={currencyFormatter.format(recapTotals.totalNonPaye)}
              data-testid="planning-recap-unpaid"
            />
            <div
              className={`rounded-xl border px-4 py-3 text-sm shadow-sm transition-colors ${
                tasksSummary.items.length > 0
                  ? 'border-sky-200/70 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10'
                  : 'border-slate-200/70 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Tâches
              </p>
              <p className="mt-1 text-lg font-semibold text-sky-700 dark:text-sky-300">
                {currencyFormatter.format(recapTotals.totalTaches)}
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

        {/* Daily Todo Section - Only visible in week view */}
        {view === 'week' && planningTab !== TEAM_PLANNING_TAB_SHARED && selectedMemberId && (
          <div className="mt-6">
            <DailyTodoPanel
              selectedDate={currentDate}
              userId={selectedMemberId}
              readOnly={readOnly}
              teamId={isTeamContext ? teamId : null}
              compact={true}
            />
          </div>
        )}

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
