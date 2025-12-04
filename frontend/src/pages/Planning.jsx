import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PlannerGrid from "../components/PlannerGrid";
import MonthGrid, { expandWeeklyTasksToMonthRange } from "../components/MonthGrid";
import WeekNavigationHeader from "../components/WeekNavigationHeader";
import EventModal from "../components/EventModal";
import WeeklyTaskModal from "../components/WeeklyTaskModal";
import DailyTodoPanel from "../components/DailyTodoPanel";
import useTeam from "../hooks/useTeam";
import useTasks from "../hooks/useTasks";
import useUserWeekSlots, {
  requestWeekSlotsRefresh,
} from "../hooks/useUserWeekSlots";
import { useSettings } from "../context/SettingsContext";
import { getIcon } from "../icons/registry";
import { resolveTaskIconKey } from "../constants/icons";
import {
  useFirebaseUser,
  saveEventNew,
  deleteEventNew,
  saveWeeklyTask,
  deleteWeeklyTask,
  setTeamContext,
  listenTeamMemberships,
  listenToTeamPlanningEntries,
  fetchTeamPlanningEntries,
  isPermissionDeniedError,
  watchPlanningEventsInRange,
} from "../firebase";
import { apiFetch, ServiceUnavailableError } from "../lib/api";
import { showToast } from "../utils/toast";
import { subscribeToUIEvent } from "../store/uiStore";
import { contextStore } from "../stores/contextStore";
import { ensureTeamsCache, readTeamsCache } from "../utils/teamCache";
import { SectionHeaderRow, Calendar, StatusSummaryCard } from "../ui";
import { getTaskColor, DEFAULT_TASK_COLOR } from "../constants/colors";
import { persistInvoiceSeed } from "../utils/invoiceSeedStorage";

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const DEFAULT_START = "09:00";
const DEFAULT_END = "10:00";
const TaskSummaryRow = ({ iconId, label, price, colorKey }) => {
  const IconComponent = getIcon(iconId || undefined);
  const colorStyles = getTaskColor(colorKey || DEFAULT_TASK_COLOR);

  return (
    <div
      role="listitem"
      tabIndex={0}
      className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-xs text-slate-700 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 dark:bg-slate-900/50 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
      aria-label={`${label} — ${price}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full border"
          title={label}
          style={{
            backgroundColor: colorStyles.backgroundColor,
            color: colorStyles.color,
            borderColor: colorStyles.borderColor,
          }}
        >
          <IconComponent
            className="h-4 w-4"
            aria-hidden="true"
            focusable="false"
          />
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
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-colors transition-shadow duration-150 hover:bg-blue-400 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-slate-900 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-lg disabled:hover:bg-blue-500";

const TransferCalendarIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4.5" y="5.5" width="15" height="13" rx="2.5" />
    <path d="M8 4.5v2M16 4.5v2M5 10.5h14" />
    <circle cx="9" cy="13.5" r="1.2" />
    <circle cx="15" cy="13.5" r="1.2" />
    <path d="M9 17h6" />
  </svg>
);

const TransferArrowIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 12h12" />
    <path d="M13.5 7.5 18 12l-4.5 4.5" />
  </svg>
);

const TransferTeamIcon = ({ className = "" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="9" r="3.2" />
    <path d="M4.5 19a5 5 0 0 1 9 0" />
    <circle cx="17" cy="10" r="2.5" />
    <path d="M14.5 19c.3-2.1 2-3.5 4-3.5 1 0 1.9.3 2.5.8" />
  </svg>
);

const TransferSpinnerIcon = ({ className = "" }) => (
  <svg
    className={`animate-spin ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle
      className="opacity-20"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      d="M22 12c0-5.523-4.477-10-10-10"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

const matchTeamId = (team, teamId) => {
  if (!team || !teamId) {
    return false;
  }

  return (
    team.team_id === teamId || team.teamId === teamId || team.id === teamId
  );
};

const resolveCachedTeamName = (teamId) => {
  if (!teamId) {
    return null;
  }

  const contextTeamName =
    typeof contextStore.getTeamName === "function"
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

  if (typeof window !== "undefined") {
    try {
      const storedName = window.localStorage.getItem("teamName");
      if (storedName) {
        return storedName;
      }
    } catch (storageError) {
      console.warn(
        "Unable to read cached team name from localStorage",
        storageError
      );
    }
  }

  return null;
};

const computeInitials = (name, email) => {
  if (typeof name === "string" && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length) {
      const initials = parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
      if (initials) {
        return initials;
      }
    }
  }

  if (typeof email === "string" && email.trim()) {
    const prefix = email.split("@")[0] || "";
    if (prefix) {
      return prefix.slice(0, 2).toUpperCase();
    }
  }

  return "??";
};

const normalizeTeamPlanningEntries = (entries) => {
  if (!Array.isArray(entries)) {
    return [];
  }

  const coerceToDate = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (value && typeof value === "object" && typeof value.toDate === "function") {
      const timestampDate = value.toDate();
      if (timestampDate instanceof Date && !Number.isNaN(timestampDate.getTime())) {
        return timestampDate;
      }
    }

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return null;
  };

  return entries
    .map((entry) => {
      if (!entry) {
        return null;
      }

      const startDate = coerceToDate(entry.start);
      const endDate = coerceToDate(entry.end);

      if (!startDate || !endDate) {
        return null;
      }

      return {
        ...entry,
        start: startDate,
        end: endDate,
        createdByInitials:
          entry?.createdByInitials ||
          computeInitials(entry?.createdByName, entry?.createdBy),
      };
    })
    .filter(Boolean);
};

const MEMBER_COLOR_CACHE = new Map();

const generateMemberColor = (seed) => {
  const cacheKey = seed || "member";
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
  const color = { background, border, text: "#ffffff" };
  MEMBER_COLOR_CACHE.set(cacheKey, color);
  return color;
};

const isMembershipServiceUnavailableError = (error) => {
  if (!error) {
    return false;
  }

  if (error instanceof ServiceUnavailableError) {
    return true;
  }

  if (typeof error === "object") {
    const code = error?.code || error?.response?.data?.code;
    return code === "MEMBERSHIPS_UNAVAILABLE";
  }

  return false;
};

const TEAM_PLANNING_TAB_PERSONAL = "personal";
const TEAM_PLANNING_TAB_SHARED = "team";
const TEAM_PLANNING_ACCESS_DENIED_MESSAGE =
  "Accès refusé : vous n'avez pas les droits pour consulter ce planning d'équipe.";

const toIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateSafe = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  if (typeof value === "number") {
    const candidate = new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const candidate = new Date(trimmed);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value === "object" && typeof value.toDate === "function") {
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
  if (typeof value === "string" && value.includes(":")) {
    return value;
  }
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
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
  const startStr = start.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  const endStr = end.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `Semaine du ${startStr} au ${endStr}`;
};

const formatMonthLabel = (date) =>
  date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

const buildMemberLabel = (member, currentUser) => {
  if (!member) {
    return "Membre";
  }
  const base = member.displayName || member.email || null;
  if (member.uid === currentUser?.uid) {
    return base || currentUser.displayName || currentUser.email || "Moi";
  }
  if (base) {
    return base;
  }
  return `Membre ${member.uid.slice(0, 6)}`;
};

const formatHoursDuration = (hours) => {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "0 h";
  }
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${wholeHours} h`;
  }
  return `${wholeHours} h ${minutes} min`;
};

export default function Planning() {
  const user = useFirebaseUser();
  const { settings } = useSettings();
  const { teamId: routeTeamId } = useParams();
  const isTeamContext = Boolean(routeTeamId);
  const teamId = routeTeamId || null;
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const rawViewParam = (searchParams.get("view") || "").toLowerCase();
  const viewParam = rawViewParam === "month" ? "month" : "week";
  const [view, setView] = useState(viewParam);
  const [planningTabState, setPlanningTabState] = useState(
    TEAM_PLANNING_TAB_PERSONAL
  );
  const [planningTabManuallySelected, setPlanningTabManuallySelected] =
    useState(false);

  const setPlanningTab = useCallback((nextTab) => {
    setPlanningTabManuallySelected(true);
    setPlanningTabState(nextTab);
  }, []);

  const setPlanningTabAuto = useCallback((nextTab) => {
    setPlanningTabManuallySelected(false);
    setPlanningTabState(nextTab);
  }, []);

  useEffect(() => {
    if (view !== viewParam) {
      setView(viewParam);
    }
  }, [viewParam, view]);

  useEffect(() => {
    setPlanningTabAuto(TEAM_PLANNING_TAB_PERSONAL);
  }, [isTeamContext, teamId, setPlanningTabAuto]);

  const handleViewChange = useCallback(
    (nextView) => {
      const normalized = nextView === "month" ? "month" : "week";
      if (normalized === viewParam) {
        return;
      }

      const params = new URLSearchParams(searchParams);
      if (normalized === "week") {
        params.delete("view");
      } else {
        params.set("view", "month");
      }

      setSearchParams(params, { replace: true });
    },
    [viewParam, searchParams, setSearchParams]
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const setCurrentDateSafe = useCallback((nextValue) => {
    setCurrentDate((previous) => {
      const resolved =
        typeof nextValue === "function" ? nextValue(previous) : nextValue;

      const safeDate = toDateSafe(resolved);
      if (safeDate instanceof Date && !Number.isNaN(safeDate.getTime())) {
        return safeDate;
      }

      const fallback = new Date();
      fallback.setHours(0, 0, 0, 0);
      return fallback;
    });
  }, []);
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState(null);

  const createInitialEventModalState = () => ({
    open: false,
    event: null,
    selectedDate: null,
    readOnly: false,
    initialLinkedTaskId: null,
  });

  const createInitialWeeklyTaskModalState = () => ({
    open: false,
    task: null,
    linkedEvent: null,
    linkedTaskId: null,
    linkedEventReadOnly: false,
    defaultDayIndex: null,
    linkedTasks: [],
  });

  const [modal, setModal] = useState(() => createInitialEventModalState());
  const [weeklyTaskModal, setWeeklyTaskModal] = useState(
    () => createInitialWeeklyTaskModalState(),
  );
  const [isTransferringSoloWeek, setIsTransferringSoloWeek] = useState(false);
  const [dayDuplicationSource, setDayDuplicationSource] = useState(null);
  const [isDuplicatingDay, setIsDuplicatingDay] = useState(false);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [teamMembershipReady, setTeamMembershipReady] =
    useState(!isTeamContext);
  const [teamMembershipAllowed, setTeamMembershipAllowed] =
    useState(!isTeamContext);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState(null);
  const [teamPlanningEntries, setTeamPlanningEntries] = useState([]);
  const [teamPlanningLoading, setTeamPlanningLoading] = useState(false);
  const [teamPlanningError, setTeamPlanningError] = useState(null);
  const [teamPlanningRefreshToken, setTeamPlanningRefreshToken] = useState(0);
  const [personalMonthEvents, setPersonalMonthEvents] = useState([]);
  const [personalMonthEventsLoading, setPersonalMonthEventsLoading] =
    useState(false);
  const [personalMonthEventsError, setPersonalMonthEventsError] =
    useState(null);
  const [recapViewTab, setRecapViewTab] = useState("amounts");
  const teamPlanningSubscriptionRef = useRef(null);
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
      const matched = availableTeams.find((candidate) =>
        matchTeamId(candidate, teamId)
      );
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

  const planningTab = useMemo(() => {
    if (!isTeamContext) {
      return planningTabState;
    }
    if (!sharedTeamId) {
      return TEAM_PLANNING_TAB_PERSONAL;
    }
    return planningTabState;
  }, [isTeamContext, planningTabState, sharedTeamId]);

  useEffect(() => {
    if (!isTeamContext) {
      return;
    }
    if (
      planningTabState === TEAM_PLANNING_TAB_SHARED &&
      !sharedTeamId
    ) {
      setPlanningTabAuto(TEAM_PLANNING_TAB_PERSONAL);
    }
  }, [
    isTeamContext,
    planningTabState,
    sharedTeamId,
    setPlanningTabAuto,
  ]);

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
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }),
    []
  );

  const resolveStatusCategory = useCallback((status) => {
    if (!status) {
      return "unpaid";
    }
    const normalized = status.toString().trim().toLowerCase();
    if (!normalized) {
      return "unpaid";
    }
    if (["not_worked", "cancelled", "canceled"].includes(normalized)) {
      return null;
    }
    if (
      [
        "paid",
        "payé",
        "paye",
        "payee",
        "réglé",
        "regle",
        "reglé",
        "reglee",
        "settled",
      ].includes(normalized)
    ) {
      return "paid";
    }
    if (
      [
        "pending",
        "waiting",
        "awaiting",
        "en attente",
        "en_attente",
        "attente",
        "quote",
        "quote_sent",
        "sent",
        "devis",
        "devis envoyé",
        "devis_envoye",
        "estimate",
        "estimation",
        "waiting_payment",
      ].includes(normalized)
    ) {
      return "pending";
    }
    if (
      [
        "unpaid",
        "non payé",
        "non_paye",
        "impayé",
        "impaye",
        "overdue",
      ].includes(normalized)
    ) {
      return "unpaid";
    }
    return "pending";
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }
    if (isTeamContext && teamId) {
      contextStore.set({ type: "team", teamId, teamName: resolvedTeamName });
      setTeamContext(teamId);
    } else {
      contextStore.set({ type: "solo" });
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

    ensureTeamsCache(() => apiFetch("/teams/my"))
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
        console.error("Planning: unable to load teams", error);
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
            include_archived: "false",
          });
          const response = await apiFetch(`/clients?${params.toString()}`, {
            headers: { "X-User-Id": user.uid },
          });

          const batch = Array.isArray(response?.clients)
            ? response.clients
            : [];
          batch.forEach((client) => {
            if (!client || !client.id) {
              return;
            }

            const normalized = {
              ...client,
              use_global_rate:
                typeof client.use_global_rate === "boolean"
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

          const total =
            typeof response?.total === "number" ? response.total : null;
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
            console.error("Planning: unable to load clients", error);
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
      setTeamMembershipAllowed(true);
      return;
    }

    if (!user?.uid || !teamId) {
      setTeamMembershipReady(false);
      setTeamMembershipAllowed(false);
      return;
    }

    let cancelled = false;
    setTeamMembershipReady(false);
    setTeamMembershipAllowed(false);

    const ensureMembership = async () => {
      try {
        await apiFetch(`/teams/${teamId}/memberships/ensure`, {
          method: "POST",
          body: JSON.stringify({ include_joined_at: false }),
        });
        if (!cancelled) {
          setTeamMembershipAllowed(true);
          setTeamMembershipReady(true);
          setTeamPlanningError(null);
        }
      } catch (error) {
        console.error("ensureTeamMembership error", error);
        if (cancelled) {
          return;
        }

        const status = error?.status ?? error?.response?.status ?? null;
        const code = error?.code;
        const denied =
          status === 403 ||
          code === "permission-denied" ||
          isPermissionDeniedError(error);

        if (denied) {
          setTeamMembershipAllowed(false);
          setTeamPlanningEntries([]);
          setTeamPlanningLoading(false);
          setTeamPlanningError(TEAM_PLANNING_ACCESS_DENIED_MESSAGE);
        } else {
          showToast(
            "Impossible de vérifier votre appartenance à l'équipe",
            true
          );
          setTeamMembershipAllowed(true);
        }

        setTeamMembershipReady(true);
      }
    };

    ensureMembership();

    return () => {
      cancelled = true;
    };
  }, [
    isTeamContext,
    teamId,
    user?.uid,
    setTeamPlanningEntries,
    setTeamPlanningError,
    setTeamPlanningLoading,
  ]);

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

    if (!teamMembershipAllowed) {
      if (!teamMembershipReady) {
        setMembers([]);
        setMembersLoading(true);
        setMembersError(null);
        setSelectedMemberId(null);
        return () => {};
      }
      setMembers([]);
      setMembersLoading(false);
      setMembersError(TEAM_PLANNING_ACCESS_DENIED_MESSAGE);
      setSelectedMemberId(null);
      return () => {};
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

    const unsubscribe = listenTeamMemberships(teamId, {
      onData: (rawMembers = []) => {
        const seen = new Set();
        const resolvedMembers = [];

        const appendMember = (member) => {
          if (!member || !member.uid || seen.has(member.uid)) {
            return;
          }

          const displayNameCandidate =
            member.displayName ||
            member.name ||
            member.label ||
            member.email ||
            member.uid;

          seen.add(member.uid);
          resolvedMembers.push({
            ...member,
            uid: member.uid,
            displayName:
              member.uid === user.uid
                ? user.displayName || user.email || displayNameCandidate
                : displayNameCandidate,
            email:
              member.uid === user.uid
                ? user.email || member.email || null
                : member.email || null,
          });
        };

        const membershipEntries = Array.isArray(rawMembers) ? rawMembers : [];
        membershipEntries.forEach(appendMember);

        if (user?.uid && !seen.has(user.uid)) {
          appendMember({
            uid: user.uid,
            displayName: user.displayName || user.email || user.uid,
            email: user.email || null,
          });
        }

        setMembers(resolvedMembers);
        setMembersLoading(false);
        setMembersError(null);

        setSelectedMemberId((current) => {
          if (current) {
            return current;
          }
          if (user?.uid) {
            return user.uid;
          }
          return resolvedMembers[0]?.uid || null;
        });
      },
      onError: (error) => {
        console.error("listenTeamMemberships error", error);
        setMembers([]);
        setMembersError(error);
        setMembersLoading(false);
      },
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [
    isTeamContext,
    teamId,
    teamMembershipReady,
    teamMembershipAllowed,
    user?.uid,
    user?.displayName,
    user?.email,
  ]);

  useEffect(() => {
    const cleanupSubscription = () => {
      if (teamPlanningSubscriptionRef.current) {
        teamPlanningSubscriptionRef.current();
        teamPlanningSubscriptionRef.current = null;
      }
    };

    if (planningTab !== TEAM_PLANNING_TAB_SHARED) {
      cleanupSubscription();
      setTeamPlanningEntries([]);
      setTeamPlanningLoading(false);
      setTeamPlanningError(null);
      return;
    }

    if (!sharedTeamId) {
      cleanupSubscription();
      setTeamPlanningEntries([]);
      setTeamPlanningLoading(false);
      setTeamPlanningError(null);
      return;
    }

    if (isTeamContext && !teamMembershipAllowed) {
      if (!teamMembershipReady) {
        cleanupSubscription();
        setTeamPlanningEntries([]);
        setTeamPlanningLoading(true);
        setTeamPlanningError(null);
        return;
      }
      cleanupSubscription();
      setTeamPlanningEntries([]);
      setTeamPlanningLoading(false);
      setTeamPlanningError(TEAM_PLANNING_ACCESS_DENIED_MESSAGE);
      return;
    }

    let cancelled = false;
    setTeamPlanningLoading(true);
    setTeamPlanningError(null);

    const applyEntries = (entries) => {
      if (cancelled) {
        return;
      }
      const normalized = normalizeTeamPlanningEntries(entries);
      setTeamPlanningEntries(normalized);
      setTeamPlanningLoading(false);
      setTeamPlanningError(null);
    };

    const loadFallbackEntries = async ({ preferApi = false } = {}) => {
      try {
        const fallback = await fetchTeamPlanningEntries(sharedTeamId, {
          preferApi,
        });
        applyEntries(fallback);
      } catch (fallbackError) {
        if (cancelled) {
          return;
        }
        const permissionIssue = isPermissionDeniedError(fallbackError);
        const serviceUnavailable =
          isMembershipServiceUnavailableError(fallbackError);
        const logMethod =
          permissionIssue || serviceUnavailable ? console.warn : console.error;
        logMethod("team planning fallback load error", fallbackError);
        setTeamPlanningEntries([]);
        if (permissionIssue) {
          setTeamPlanningError(TEAM_PLANNING_ACCESS_DENIED_MESSAGE);
        } else if (serviceUnavailable) {
          setTeamPlanningError(fallbackError);
        } else {
          setTeamPlanningError("Impossible de charger le planning d'équipe");
        }
        setTeamPlanningLoading(false);
      }
    };

    const handleSnapshotError = async (error) => {
      if (cancelled) {
        return;
      }
      const permissionDenied = isPermissionDeniedError(error);
      if (permissionDenied) {
        console.warn("team planning realtime permission error", error);
      } else {
        console.error("team planning realtime error", error);
      }
      cleanupSubscription();
      await loadFallbackEntries({ preferApi: permissionDenied });
    };

    cleanupSubscription();

    try {
      teamPlanningSubscriptionRef.current = listenToTeamPlanningEntries(
        sharedTeamId,
        {
          onData: applyEntries,
          onError: handleSnapshotError,
        }
      );
    } catch (subscriptionError) {
      teamPlanningSubscriptionRef.current = null;
      handleSnapshotError(subscriptionError);
    }

    return () => {
      cancelled = true;
      cleanupSubscription();
    };
  }, [
    planningTab,
    sharedTeamId,
    teamPlanningRefreshToken,
    isTeamContext,
    teamMembershipAllowed,
  ]);

  const planningContext = useMemo(() => {
    if (!user?.uid) {
      return null;
    }
    if (planningTab === TEAM_PLANNING_TAB_SHARED) {
      if (!sharedTeamId) {
        return null;
      }
      if (isTeamContext && !teamMembershipAllowed) {
        return null;
      }
      return { type: "team-shared", teamId: sharedTeamId, userId: user.uid };
    }
    if (isTeamContext) {
      if (!teamMembershipAllowed) {
        return null;
      }
      if (!teamMembershipReady || !teamId || !selectedMemberId) {
        return null;
      }
      return { type: "team", teamId, memberUid: selectedMemberId };
    }
    return { type: "personal", userId: user.uid };
  }, [
    planningTab,
    sharedTeamId,
    isTeamContext,
    teamMembershipReady,
    teamMembershipAllowed,
    teamId,
    selectedMemberId,
    user?.uid,
  ]);

  const readOnly = useMemo(() => {
    if (isTeamContext && !teamMembershipAllowed) {
      return true;
    }
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
  }, [
    planningTab,
    isTeamContext,
    teamMembershipAllowed,
    selectedMemberId,
    user?.uid,
  ]);

  const isViewingOtherTeamMember =
    isTeamContext &&
    planningTab !== TEAM_PLANNING_TAB_SHARED &&
    Boolean(selectedMemberId && user?.uid && selectedMemberId !== user.uid);

  const shouldDelayEvents =
    planningTab !== TEAM_PLANNING_TAB_SHARED &&
    isTeamContext &&
    (!teamMembershipReady || !teamMembershipAllowed);

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

  const resolveSlotBillingInfo = useCallback(
    (slot, hourlyRateValue) => {
      if (!slot || typeof slot !== "object") {
        return null;
      }

      const normalizedType =
        typeof slot.type === "string" ? slot.type.trim().toLowerCase() : "";

      if (normalizedType === "absence") {
        return null;
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
        if (typeof candidate === "string") {
          const normalized = candidate.trim().toLowerCase();
          if (!normalized) {
            continue;
          }
          if (
            ["task", "weekly_task", "weekly-task", "absence"].includes(
              normalized
            )
          ) {
            continue;
          }
        }
        explicitStatus = candidate;
        break;
      }

      const normalizedSource =
        typeof slot?.source === "string"
          ? slot.source.trim().toLowerCase()
          : "";
      const normalizedKind =
        typeof slot?.kind === "string" ? slot.kind.trim().toLowerCase() : "";

      const explicitWeeklyTask =
        slot?.weekly === true ||
        slot?.isWeeklyTask === true ||
        slot?.is_task === true ||
        normalizedSource === "weekly_task" ||
        normalizedKind === "weekly_task" ||
        normalizedType === "task" ||
        normalizedType === "weekly_task" ||
        normalizedType === "weekly-task" ||
        typeof slot?.weekly_task_id === "string" ||
        typeof slot?.weeklyTaskId === "string" ||
        typeof slot?.task_id === "string" ||
        typeof slot?.taskId === "string" ||
        typeof slot?.weekly_task_occurrence_id === "string" ||
        typeof slot?.weeklyTaskOccurrenceId === "string" ||
        typeof slot?.task_occurrence_id === "string" ||
        typeof slot?.taskOccurrenceId === "string";

      const taskLabel = (() => {
        if (typeof slot?.task_label === "string" && slot.task_label.trim()) {
          return slot.task_label.trim();
        }
        if (typeof slot?.taskLabel === "string" && slot.taskLabel.trim()) {
          return slot.taskLabel.trim();
        }
        if (typeof slot?.task_name === "string" && slot.task_name.trim()) {
          return slot.task_name.trim();
        }
        if (typeof slot?.taskName === "string" && slot.taskName.trim()) {
          return slot.taskName.trim();
        }
        return "";
      })();

      const hasClientSignal = Boolean(
        (typeof slot?.client === "string" && slot.client.trim()) ||
          (slot?.client && typeof slot.client === "object") ||
          (typeof slot?.client_name === "string" && slot.client_name.trim()) ||
          (typeof slot?.clientName === "string" && slot.clientName.trim()) ||
          (typeof slot?.client_label === "string" && slot.client_label.trim()) ||
          (typeof slot?.clientLabel === "string" && slot.clientLabel.trim()) ||
          (typeof slot?.client_id === "string" && slot.client_id.trim()) ||
          (typeof slot?.clientId === "string" && slot.clientId.trim())
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
            const taskIdentifier =
              slot?.task_occurrence_id ||
              slot?.taskOccurrenceId ||
              slot?.weekly_task_occurrence_id ||
              slot?.weeklyTaskOccurrenceId ||
              slot?.task_id ||
              slot?.taskId ||
              slot?.id ||
              null;
            return {
              type: "task",
              price: numeric,
              taskIdentifier: taskIdentifier ? String(taskIdentifier) : null,
              label:
                taskLabel ||
                slot?.title ||
                slot?.description ||
                "Tâche",
            };
          }
        }
        return null;
      }

      if (!hasClientSignal && !hasRate && !hasExplicitStatus) {
        return null;
      }

      const startDate = getSlotStartDate(slot);
      const endDate = getSlotEndDate(slot);

      if (
        !(startDate instanceof Date) ||
        Number.isNaN(startDate.getTime()) ||
        !(endDate instanceof Date) ||
        Number.isNaN(endDate.getTime())
      ) {
        return null;
      }

      const durationMs = endDate.getTime() - startDate.getTime();
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return null;
      }

      const durationHours = durationMs / (60 * 60 * 1000);
      if (!Number.isFinite(durationHours) || durationHours <= 0) {
        return null;
      }

      const numericGlobalRate = Number(hourlyRateValue);
      const globalRate =
        Number.isFinite(numericGlobalRate) && numericGlobalRate > 0
          ? numericGlobalRate
          : 0;

      let rateToApply = null;

      const clientId =
        slot?.clientId ||
        slot?.client_id ||
        (slot?.client && typeof slot.client === "object"
          ? slot.client.id || slot.client.client_id || null
          : null);
      let resolvedClient = null;

      if (clientId) {
        resolvedClient =
          clientMap.get(clientId) ||
          (Array.isArray(clients)
            ? clients.find((candidate) => candidate?.id === clientId)
            : null);
      }

      if (!resolvedClient && slot?.client && typeof slot.client === "object") {
        resolvedClient = slot.client;
      }

      if (resolvedClient) {
        const usesGlobalRate =
          resolvedClient?.useGlobalRate ?? resolvedClient?.use_global_rate;
        const clientHourlyRate =
          resolvedClient?.hourlyRate ??
          resolvedClient?.hourly_rate ??
          resolvedClient?.hourly_rate_custom ??
          resolvedClient?.hourlyRateCustom ??
          null;

        const parsedClientRate = Number(clientHourlyRate);
        const normalizedUseGlobal =
          typeof usesGlobalRate === "string"
            ? ["global", "true"].includes(usesGlobalRate.trim().toLowerCase())
            : usesGlobalRate;

        if (
          normalizedUseGlobal === false &&
          Number.isFinite(parsedClientRate) &&
          parsedClientRate > 0
        ) {
          rateToApply = parsedClientRate;
        } else if (normalizedUseGlobal === true) {
          if (globalRate > 0) {
            rateToApply = globalRate;
          }
        } else if (
          Number.isFinite(parsedClientRate) &&
          parsedClientRate > 0
        ) {
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
        return null;
      }

      const amount = durationHours * rateToApply;
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      const statusCategory = resolveStatusCategory(
        explicitStatus ??
          slot?.payment_status ??
          slot?.status ??
          slot?.type ??
          ""
      );
      if (!statusCategory) {
        return null;
      }

      const resolveClientLabel = () => {
        if (resolvedClient) {
          const explicitLabel =
            resolvedClient.display_name ||
            resolvedClient.displayName ||
            resolvedClient.name ||
            resolvedClient.label ||
            resolvedClient.company ||
            resolvedClient.client_name ||
            null;
          if (explicitLabel) {
            return explicitLabel;
          }
        }
        const slotCandidates = [
          slot?.client_label,
          slot?.clientLabel,
          slot?.client_name,
          slot?.clientName,
          typeof slot?.client === "string" ? slot.client : null,
        ];
        for (const candidate of slotCandidates) {
          if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
          }
        }
        return "Client";
      };

      return {
        type: "event",
        amount,
        durationHours,
        statusCategory,
        clientId: clientId ? String(clientId) : null,
        clientLabel: resolveClientLabel(),
        startDate,
        endDate,
        rate: rateToApply,
      };
    },
    [clientMap, clients, resolveStatusCategory]
  );

  const calculateRecapTotals = useCallback(
    (slotsList, taskList, hourlyRateValue) => {
      const totals = {
        totalPaye: 0,
        totalEnAttente: 0,
        totalNonPaye: 0,
        totalTaches: 0,
      };

      const countedTaskIds = new Set();
      const slotsArray = Array.isArray(slotsList) ? slotsList : [];

      slotsArray.forEach((slot) => {
        const billingInfo = resolveSlotBillingInfo(slot, hourlyRateValue);
        if (!billingInfo) {
          return;
        }
        if (billingInfo.type === "task") {
          totals.totalTaches += billingInfo.price;
          if (billingInfo.taskIdentifier) {
            countedTaskIds.add(String(billingInfo.taskIdentifier));
          }
          return;
        }

        if (billingInfo.statusCategory === "paid") {
          totals.totalPaye += billingInfo.amount;
        } else if (billingInfo.statusCategory === "pending") {
          totals.totalEnAttente += billingInfo.amount;
        } else if (billingInfo.statusCategory === "unpaid") {
          totals.totalNonPaye += billingInfo.amount;
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
            ? `${occurrence.taskId}-${
                occurrence.taskDateISO || occurrence.task_date_iso || ""
              }`
            : null);

        if (occurrenceId && countedTaskIds.has(String(occurrenceId))) {
          return;
        }

        const price = Number(occurrence.price);
        if (Number.isFinite(price) && price !== 0) {
          totals.totalTaches += price;
          if (occurrenceId) {
            countedTaskIds.add(String(occurrenceId));
          }
        }
      });

      return totals;
    },
    [resolveSlotBillingInfo]
  );

  const buildMonthlyClientSummary = useCallback(
    (slotsList, tasksList, hourlyRateValue) => {
      const eventsArray = Array.isArray(slotsList) ? slotsList : [];
      const tasksArray = Array.isArray(tasksList) ? tasksList : [];
      const summaryMap = new Map();
      const unattachedTasks = [];

      const normalizeLabel = (value) =>
        typeof value === "string" ? value.trim().toLowerCase() : "";

      const ensureEntry = (clientId, clientLabel) => {
        const normalizedLabel =
          typeof clientLabel === "string" && clientLabel.trim()
            ? clientLabel.trim()
            : "Client";
        const key = clientId
          ? `id:${clientId}`
          : `label:${normalizedLabel.toLowerCase()}`;
        if (summaryMap.has(key)) {
          const existing = summaryMap.get(key);
          if (!existing.clientId && clientId) {
            existing.clientId = clientId;
          }
          if (!existing.clientLabel && normalizedLabel) {
            existing.clientLabel = normalizedLabel;
          }
          return existing;
        }
        const entry = {
          key,
          clientId: clientId || null,
          clientLabel: normalizedLabel,
          totalHours: 0,
          totalAmount: 0,
          tasks: [],
          events: [],
        };
        summaryMap.set(key, entry);
        return entry;
      };

      const findEntryByClientId = (clientId) => {
        if (!clientId) {
          return null;
        }
        const entry = summaryMap.get(`id:${clientId}`);
        return entry || null;
      };

      const findEntryByClientLabel = (clientLabel) => {
        const normalized = normalizeLabel(clientLabel);
        if (!normalized) {
          return null;
        }
        for (const entry of summaryMap.values()) {
          if (normalizeLabel(entry.clientLabel) === normalized) {
            return entry;
          }
        }
        return null;
      };

      const resolveTaskPrice = (task) => {
        const candidates = [
          task?.price,
          task?.amount,
          task?.total,
          task?.value,
          task?.originalTask?.price,
          task?.originalTask?.amount,
          task?.originalTask?.total,
          task?.originalTask?.value,
        ];
        for (const candidate of candidates) {
          const numericValue = Number(candidate);
          if (Number.isFinite(numericValue)) {
            return numericValue;
          }
        }
        return 0;
      };

      const mergeTasksWithSameLabel = (tasks) => {
        if (!Array.isArray(tasks) || tasks.length === 0) {
          return [];
        }

        const merged = new Map();

        tasks.forEach((task) => {
          if (!task) {
            return;
          }

          const normalizedLabel =
            typeof task.label === "string" && task.label.trim()
              ? task.label.trim()
              : "Tâche associée";
          const key = normalizedLabel.toLowerCase();
          const existing = merged.get(key);

          if (existing) {
            const combinedPrice = Number(existing.price) + Number(task.price || 0);
            existing.price = Math.round(combinedPrice * 100) / 100;
            existing.count += 1;
            return;
          }

          merged.set(key, {
            ...task,
            label: normalizedLabel,
            price: Math.round(Number(task.price || 0) * 100) / 100,
            count: 1,
          });
        });

        return Array.from(merged.values()).map((task) => ({
          ...task,
          label: task.count > 1 ? `${task.label} x${task.count}` : task.label,
        }));
      };

      const resolveTaskColorKey = (task) => {
        const candidates = [
          task?.color,
          task?.taskColor,
          task?.task_color,
          task?.originalTask?.color,
        ];
        const match = candidates.find(
          (candidate) => typeof candidate === "string" && candidate.trim(),
        );
        return match || DEFAULT_TASK_COLOR;
      };

      const resolveTaskIcon = (task) =>
        resolveTaskIconKey(task?.icon || task?.originalTask?.icon || null);

      eventsArray.forEach((slot) => {
        const info = resolveSlotBillingInfo(slot, hourlyRateValue);
        if (!info || info.type !== "event") {
          return;
        }
        const entry = ensureEntry(info.clientId, info.clientLabel);
        entry.totalAmount += info.amount;
        entry.totalHours += info.durationHours;
        if (info.startDate && info.endDate) {
          entry.events.push({ start: info.startDate, end: info.endDate });
        }
      });

      const findEntryForTask = (startDate, endDate, task) => {
        const directClientIdRaw =
          (typeof task?.clientId === "string" && task.clientId.trim()) ||
          (typeof task?.client_id === "string" && task.client_id.trim()) ||
          (task?.client &&
            typeof task.client === "object" &&
            ((task.client.id && String(task.client.id)) ||
              (task.client.client_id && String(task.client.client_id)))) ||
          null;
        if (directClientIdRaw) {
          const directEntry = findEntryByClientId(String(directClientIdRaw));
          if (directEntry) {
            return directEntry;
          }
        }

        const candidateLabel =
          task?.clientLabel ||
          task?.client_name ||
          task?.client?.display_name ||
          task?.client?.name ||
          null;
        if (candidateLabel) {
          const entryByLabel = findEntryByClientLabel(candidateLabel);
          if (entryByLabel) {
            return entryByLabel;
          }
        }

        if (!startDate || !endDate) {
          return null;
        }
        for (const entry of summaryMap.values()) {
          if (
            entry.events.some(
              (eventRange) =>
                startDate < eventRange.end && endDate > eventRange.start
            )
          ) {
            return entry;
          }
        }
        return null;
      };

      tasksArray.forEach((task) => {
        const price = resolveTaskPrice(task);
        if (!Number.isFinite(price) || price === 0) {
          return;
        }
        const taskStart =
          toDateSafe(task?.start) ||
          toDateSafe(task?.startDate) ||
          toDateSafe(task?.start_date) ||
          toDateSafe(task?.taskStart);
        const taskEnd =
          toDateSafe(task?.end) ||
          toDateSafe(task?.endDate) ||
          toDateSafe(task?.end_date) ||
          toDateSafe(task?.taskEnd);
        if (
          !(taskStart instanceof Date) ||
          Number.isNaN(taskStart.getTime()) ||
          !(taskEnd instanceof Date) ||
          Number.isNaN(taskEnd.getTime()) ||
          taskEnd <= taskStart
        ) {
          return;
        }
        const label =
          task?.title ||
          task?.label ||
          task?.taskLabel ||
          task?.originalTask?.label ||
          task?.originalTask?.title ||
          "Tâche associée";
        const identifier =
          task?.id ||
          task?.occurrenceId ||
          task?.taskId ||
          `${label}-${taskStart.getTime()}`;
        const taskEntry = {
          id: String(identifier),
          label,
          price,
          icon: resolveTaskIcon(task),
          color: resolveTaskColorKey(task),
        };
        const targetEntry = findEntryForTask(taskStart, taskEnd, task);
        if (!targetEntry) {
          unattachedTasks.push(taskEntry);
          return;
        }
        targetEntry.tasks.push(taskEntry);
        targetEntry.totalAmount += price;
      });

      const mergedSummaries = Array.from(summaryMap.values())
        .map((entry) => ({
          key: entry.key,
          clientId: entry.clientId,
          clientLabel: entry.clientLabel,
          totalHours: Number(entry.totalHours.toFixed(2)),
          totalAmount: Math.round(entry.totalAmount * 100) / 100,
          tasks: mergeTasksWithSameLabel(entry.tasks),
        }))
        .filter((entry) =>
          entry.totalAmount > 0 || entry.totalHours > 0 || entry.tasks.length > 0
        )
        .sort((a, b) => b.totalAmount - a.totalAmount);

      return {
        summaries: mergedSummaries,
        unattachedTasks: mergeTasksWithSameLabel(
          unattachedTasks.filter(
            (task) => Number.isFinite(task.price) && task.price !== 0
          )
        ),
      };
    },
    [resolveSlotBillingInfo]
  );

  const effectiveTasksContext =
    planningTab === TEAM_PLANNING_TAB_SHARED ? null : planningContext;

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
    if (
      !Array.isArray(teamPlanningEntries) ||
      teamPlanningEntries.length === 0
    ) {
      return [];
    }
    const startTime = weekStart.getTime();
    const endTime = weekEnd.getTime();

    return teamPlanningEntries
      .map((entry) => {
        const startDate =
          entry.start instanceof Date ? entry.start : new Date(entry.start);
        const endDate =
          entry.end instanceof Date ? entry.end : new Date(entry.end);
        if (
          !startDate ||
          Number.isNaN(startDate.getTime()) ||
          !endDate ||
          Number.isNaN(endDate.getTime())
        ) {
          return null;
        }
        return {
          ...entry,
          start: startDate,
          end: endDate,
          createdByInitials:
            entry.createdByInitials ||
            computeInitials(entry.createdByName, entry.createdBy),
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
    return teamEntriesForWeek.filter(
      (entry) => (entry?.type || "event").toLowerCase() !== "task"
    );
  }, [teamEntriesForWeek]);

  const teamTaskBlocks = useMemo(() => {
    if (!teamEntriesForWeek.length) {
      return [];
    }
    return teamEntriesForWeek.filter(
      (entry) => (entry?.type || "").toLowerCase() === "task"
    );
  }, [teamEntriesForWeek]);

  const teamEventsMerged = useMemo(() => {
    if (!teamEventBlocks.length) {
      return [];
    }

    const validEntries = teamEventBlocks.filter(
      (entry) =>
        entry?.start instanceof Date &&
        !Number.isNaN(entry.start.getTime()) &&
        entry?.end instanceof Date &&
        !Number.isNaN(entry.end.getTime()),
    );

    if (!validEntries.length) {
      return [];
    }

    const groups = new Map();
    validEntries.forEach((entry) => {
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
        return (a.createdByName || "").localeCompare(b.createdByName || "");
      });
      const base = sorted[0];
      const participants = sorted.map((item) => {
        const color = generateMemberColor(
          item.createdBy ||
            item.createdByName ||
            item.createdByInitials ||
            "member"
        );
        return {
          id: item.createdBy || item.id,
          name: item.createdByName || "Membre",
          initials:
            item.createdByInitials ||
            computeInitials(item.createdByName, item.createdBy),
          background: color.background,
          border: color.border,
          text: color.text,
        };
      });
      const tooltipDetails = sorted.map(
        (item) => `${item.title || "Bloc"} — ${item.createdByName || "Membre"}`
      );
      merged.push({
        ...base,
        teamParticipants: participants,
        teamMerged: sorted.length > 1,
        teamMergedEntries: sorted,
        teamMergedTooltip: tooltipDetails.join("\n"),
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
        const rawDayIndex = Math.floor(
          (startDate.getTime() - weekStartMs) / msInDay
        );
        if (rawDayIndex < 0 || rawDayIndex > 6) {
          return null;
        }
        const dayIndex = rawDayIndex;
        const color = generateMemberColor(
          task.createdBy || task.createdByName || task.id
        );
        const participant = {
          id: task.createdBy || task.id,
          name: task.createdByName || "Membre",
          initials:
            task.createdByInitials ||
            computeInitials(task.createdByName, task.createdBy),
          background: color.background,
          border: color.border,
          text: color.text,
        };
        return {
          taskId: task.id,
          occurrenceId: task.id,
          dayIndex,
          startDate,
          endDate,
          label: task.title || "Tâche",
          color: task.color || color.background,
          price: typeof task.price === "number" ? task.price : null,
          icon: task.icon || null,
          readOnly: false,
          teamParticipants: [participant],
        };
      })
      .filter(Boolean);
  }, [teamTaskBlocks, weekStart]);

  const currentMonthRange = useMemo(() => {
    const from = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    from.setHours(0, 0, 0, 0);
    const to = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [currentDate]);

  const teamMonthEvents = useMemo(() => {
    if (planningTab !== TEAM_PLANNING_TAB_SHARED) {
      return [];
    }
    const { from, to } = currentMonthRange;
    if (!from || !to) {
      return [];
    }
    return teamPlanningEntries
      .filter((entry) => {
        const entryType = (entry?.type || "event").toLowerCase();
        if (entryType === "task") {
          return false;
        }
        if (!(entry?.start instanceof Date) || !(entry?.end instanceof Date)) {
          return false;
        }
        return entry.start <= to && entry.end >= from;
      })
      .map((entry) => ({
        id: entry.id || `${entry.start.getTime()}-${entry.end.getTime()}`,
        start: entry.start,
        end: entry.end,
        title: entry.title || entry.clientName || "Bloc partagé",
        client:
          entry.clientName ||
          entry.client ||
          entry.createdByName ||
          entry.title ||
          "Membre",
        description:
          entry.description || entry.title || entry.clientName || "Bloc partagé",
        color: entry.color || "#2563eb",
        status: entry.status || entry.type || "event",
        type: entry.type || "event",
      }));
  }, [planningTab, teamPlanningEntries, currentMonthRange]);

  const teamMonthTasks = useMemo(() => {
    if (planningTab !== TEAM_PLANNING_TAB_SHARED) {
      return [];
    }
    const { from, to } = currentMonthRange;
    if (!from || !to) {
      return [];
    }
    return teamPlanningEntries
      .filter((entry) => {
        const entryType = (entry?.type || "").toLowerCase();
        if (entryType !== "task") {
          return false;
        }
        if (!(entry?.start instanceof Date) || !(entry?.end instanceof Date)) {
          return false;
        }
        return entry.start <= to && entry.end >= from;
      })
      .map((task) => {
        const palette = generateMemberColor(
          task.createdBy || task.createdByName || task.id
        );
        return {
          id: task.id || `${task.start.getTime()}-task`,
          taskId: task.id || undefined,
          start: task.start,
          end: task.end,
          title: task.title || task.label || "Tâche partagée",
          label: task.label || task.title || "Tâche",
          icon: task.icon || "🗂",
          color: task.color || palette.background,
          status: task.status || "task",
          type: "task",
        };
      });
  }, [planningTab, teamPlanningEntries, currentMonthRange]);

  const teamSoloMonthTasks = useMemo(() => {
    if (
      !isTeamContext ||
      planningTab === TEAM_PLANNING_TAB_SHARED ||
      !currentMonthRange?.from ||
      !currentMonthRange?.to
    ) {
      return [];
    }
    if (!Array.isArray(weeklyTasks) || weeklyTasks.length === 0) {
      return [];
    }
    try {
      return expandWeeklyTasksToMonthRange(weeklyTasks, currentMonthRange);
    } catch (error) {
      console.warn("team month tasks expansion failed", error);
      return [];
    }
  }, [isTeamContext, planningTab, weeklyTasks, currentMonthRange]);

  useEffect(() => {
    if (planningTab === TEAM_PLANNING_TAB_SHARED) {
      setPersonalMonthEvents([]);
      setPersonalMonthEventsLoading(false);
      setPersonalMonthEventsError(null);
      return undefined;
    }

    if (!planningContext || !currentMonthRange?.from || !currentMonthRange?.to) {
      setPersonalMonthEvents([]);
      setPersonalMonthEventsLoading(false);
      setPersonalMonthEventsError(null);
      return undefined;
    }

    let active = true;
    setPersonalMonthEventsLoading(true);
    setPersonalMonthEventsError(null);

    const unsubscribe = watchPlanningEventsInRange(
      planningContext,
      currentMonthRange,
      (newEvents) => {
        if (!active) {
          return;
        }
        setPersonalMonthEvents(Array.isArray(newEvents) ? newEvents : []);
        setPersonalMonthEventsLoading(false);
      },
      (error) => {
        if (!active) {
          return;
        }
        console.error("monthly events watch error", error);
        setPersonalMonthEvents([]);
        setPersonalMonthEventsError(
          "Impossible de charger les clients du mois"
        );
        setPersonalMonthEventsLoading(false);
      }
    );

    return () => {
      active = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [planningTab, planningContext, currentMonthRange]);

  const personalMonthTasks = useMemo(() => {
    if (planningTab === TEAM_PLANNING_TAB_SHARED) {
      return [];
    }
    if (isTeamContext) {
      return teamSoloMonthTasks;
    }
    if (!currentMonthRange?.from || !currentMonthRange?.to) {
      return [];
    }
    if (!Array.isArray(weeklyTasks) || weeklyTasks.length === 0) {
      return [];
    }
    try {
      return expandWeeklyTasksToMonthRange(weeklyTasks, currentMonthRange);
    } catch (error) {
      console.warn("personal month tasks expansion failed", error);
      return [];
    }
  }, [
    planningTab,
    isTeamContext,
    teamSoloMonthTasks,
    weeklyTasks,
    currentMonthRange,
  ]);

  const monthEventsForSummary =
    planningTab === TEAM_PLANNING_TAB_SHARED
      ? teamMonthEvents
      : personalMonthEvents;

  const monthTasksForSummary =
    planningTab === TEAM_PLANNING_TAB_SHARED
      ? teamMonthTasks
      : personalMonthTasks;

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

  const coerceDateValue = useCallback((value) => {
    if (value instanceof Date) {
      return value;
    }

    if (value && typeof value === "object" && typeof value.toDate === "function") {
      return value.toDate();
    }

    return null;
  }, []);

  const isValidDateValue = useCallback((value) => {
    const date = coerceDateValue(value);
    return date instanceof Date && !Number.isNaN(date.getTime());
  }, [coerceDateValue]);

  const sanitizedActiveEvents = useMemo(() => {
    if (!Array.isArray(activeEvents)) {
      return [];
    }

    return activeEvents
      .map((event) => {
        if (!event) {
          return null;
        }

        const startValue = event.start ?? event.startDate;
        const endValue = event.end ?? event.endDate;

        if (!isValidDateValue(startValue) || !isValidDateValue(endValue)) {
          return null;
        }

        return {
          ...event,
          start: coerceDateValue(startValue),
          end: coerceDateValue(endValue),
        };
      })
      .filter(Boolean);
  }, [activeEvents, coerceDateValue, isValidDateValue]);

  const buildDayKey = useCallback((value) => {
    const date = coerceDateValue(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime();
  }, [coerceDateValue]);

  const findOverlappingEventIds = useCallback(
    (startDate, endDate, keepId = null) => {
      const startKey = buildDayKey(startDate);
      if (startKey == null) {
        return [];
      }

      const conflicts = [];
      sanitizedActiveEvents.forEach((existing) => {
        if (!existing?.id || existing.id === keepId) {
          return;
        }

        const existingStart = coerceDateValue(existing.start);
        const existingEnd = coerceDateValue(existing.end);

        if (
          !(existingStart instanceof Date) ||
          !(existingEnd instanceof Date) ||
          Number.isNaN(existingStart.getTime()) ||
          Number.isNaN(existingEnd.getTime()) ||
          existingEnd <= existingStart
        ) {
          return;
        }

        if (buildDayKey(existingStart) !== startKey) {
          return;
        }

        const overlaps =
          existingStart.getTime() < endDate.getTime() &&
          startDate.getTime() < existingEnd.getTime();

        if (overlaps) {
          conflicts.push(existing.id);
        }
      });

      return conflicts;
    },
    [buildDayKey, coerceDateValue, sanitizedActiveEvents]
  );

  const sanitizedActiveTaskOccurrences = useMemo(() => {
    if (!Array.isArray(activeTaskOccurrences)) {
      return [];
    }

    const normalized = activeTaskOccurrences
      .map((occurrence) => {
        if (!occurrence) {
          return null;
        }

        const startDate =
          coerceDateValue(occurrence.startDate) || coerceDateValue(occurrence.start);
        const endDate =
          coerceDateValue(occurrence.endDate) || coerceDateValue(occurrence.end);

        if (!isValidDateValue(startDate) || !isValidDateValue(endDate)) {
          return null;
        }

        return {
          ...occurrence,
          startDate,
          endDate,
        };
      })
      .filter(Boolean);

    return normalized;
  }, [activeTaskOccurrences, coerceDateValue, isValidDateValue]);

  const activeWeeklyTasks =
    planningTab === TEAM_PLANNING_TAB_SHARED ? [] : weeklyTasks;
  const findTaskByIdentifier = useCallback(
    (identifier) => {
      if (
        !identifier ||
        !Array.isArray(activeWeeklyTasks) ||
        activeWeeklyTasks.length === 0
      ) {
        return null;
      }
      const normalizedTarget = String(identifier).trim();
      if (!normalizedTarget) {
        return null;
      }
      const matchedTask =
        activeWeeklyTasks.find((task) => {
          if (!task) {
            return false;
          }
          const candidates = [
            task.id,
            task.taskId,
            task.task_id,
            task.occurrenceId,
            task.occurrence_id,
          ];
          return candidates.some((candidate) => {
            if (candidate == null) {
              return false;
            }
            return String(candidate).trim() === normalizedTarget;
          });
        }) || null;
      return matchedTask;
    },
    [activeWeeklyTasks]
  );
  const showTeamWeeklyTasksEmptyState =
    isViewingOtherTeamMember &&
    !tasksLoading &&
    Array.isArray(weeklyTasks) &&
    weeklyTasks.length === 0;
  const recapTotals = useMemo(
    () =>
      calculateRecapTotals(
        sanitizedActiveEvents,
        sanitizedActiveTaskOccurrences,
        hourlyRateGlobal
      ),
    [
      calculateRecapTotals,
      sanitizedActiveEvents,
      sanitizedActiveTaskOccurrences,
      hourlyRateGlobal,
    ]
  );

  const recapTotalsAll = useMemo(
    () =>
      recapTotals.totalPaye +
      recapTotals.totalEnAttente +
      recapTotals.totalNonPaye +
      recapTotals.totalTaches,
    [recapTotals]
  );

  const {
    summaries: monthlyClientSummaries,
    unattachedTasks: monthlyUnattachedTasks,
  } = useMemo(
    () => {
      const result = buildMonthlyClientSummary(
        monthEventsForSummary,
        monthTasksForSummary,
        hourlyRateGlobal,
      );

      if (Array.isArray(result)) {
        return { summaries: result, unattachedTasks: [] };
      }

      return {
        summaries: Array.isArray(result?.summaries) ? result.summaries : [],
        unattachedTasks: Array.isArray(result?.unattachedTasks)
          ? result.unattachedTasks
          : [],
      };
    },
    [
      buildMonthlyClientSummary,
      monthEventsForSummary,
      monthTasksForSummary,
      hourlyRateGlobal,
    ],
  );

  const monthlyClientsTotals = useMemo(() => {
    if (
      !Array.isArray(monthlyClientSummaries) ||
      monthlyClientSummaries.length === 0
    ) {
      return { totalAmount: 0, tasksAmount: 0 };
    }

    return monthlyClientSummaries.reduce(
      (acc, client) => {
        const clientTotal = Number(client?.totalAmount) || 0;
        const clientTasksTotal = Array.isArray(client?.tasks)
          ? client.tasks.reduce((sum, task) => {
              const price = Number(task?.price);
              if (!Number.isFinite(price) || price === 0) {
                return sum;
              }
              return sum + price;
            }, 0)
          : 0;
        acc.totalAmount += clientTotal + clientTasksTotal;
        acc.tasksAmount += clientTasksTotal;
        return acc;
      },
      { totalAmount: 0, tasksAmount: 0 }
    );
  }, [monthlyClientSummaries]);

  const monthlyUnattachedTasksSummary = useMemo(() => {
    if (!Array.isArray(monthlyUnattachedTasks) || monthlyUnattachedTasks.length === 0) {
      return { total: 0, items: [] };
    }

    const items = monthlyUnattachedTasks
      .map((task, index) => {
        const price = Number(task?.price);
        if (!Number.isFinite(price) || price === 0) {
          return null;
        }
        const label =
          (typeof task?.label === "string" && task.label.trim()) ||
          (typeof task?.title === "string" && task.title.trim()) ||
          "Tâche";
        return {
          id: task?.id || task?.taskId || `unattached-${index}`,
          label,
          price,
          icon: task?.icon || null,
          color: task?.color || DEFAULT_TASK_COLOR,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.price !== b.price) {
          return b.price - a.price;
        }
        return a.label.localeCompare(b.label, "fr");
      });

    const total = items.reduce((sum, item) => sum + item.price, 0);
    return { total, items };
  }, [monthlyUnattachedTasks]);

  const summaryCards = useMemo(
    () => [
      {
        key: "total",
        label: "Total",
        amount: recapTotalsAll,
        variant: "info",
        testId: "planning-recap-total",
      },
      {
        key: "paid",
        label: "Payé",
        amount: recapTotals.totalPaye,
        variant: "success",
        testId: "planning-recap-paid",
      },
      {
        key: "pending",
        label: "En attente",
        amount: recapTotals.totalEnAttente,
        variant: "warning",
        testId: "planning-recap-pending",
      },
      {
        key: "unpaid",
        label: "Non payé",
        amount: recapTotals.totalNonPaye,
        variant: "danger",
        testId: "planning-recap-unpaid",
      },
    ],
    [recapTotals, recapTotalsAll]
  );

  const tasksSummary = useMemo(() => {
    if (
      !Array.isArray(sanitizedActiveTaskOccurrences) ||
      sanitizedActiveTaskOccurrences.length === 0
    ) {
      return { total: 0, items: [] };
    }

    const resolveColor = (occurrence) => {
      const candidates = [
        occurrence?.color,
        occurrence?.taskColor,
        occurrence?.task?.color,
        occurrence?.originalTask?.color,
      ];
      const match = candidates.find(
        (value) => typeof value === "string" && value.trim(),
      );
      return match || DEFAULT_TASK_COLOR;
    };

    const items = sanitizedActiveTaskOccurrences
      .map((occurrence) => {
        const rawPrice = occurrence?.price;
        const priceNumber = Number(rawPrice);
        if (!Number.isFinite(priceNumber) || priceNumber === 0) {
          return null;
        }

        const label =
          typeof occurrence?.label === "string" && occurrence.label.trim()
            ? occurrence.label.trim()
            : "Tâche";

        const startDate =
          occurrence?.startDate instanceof Date ? occurrence.startDate : null;
        const sortValue = startDate
          ? startDate.getTime()
          : Number.POSITIVE_INFINITY;

        return {
          id:
            occurrence.occurrenceId ||
            `${occurrence.taskId || "task"}-${priceNumber}`,
          icon: occurrence.icon || null,
          label,
          price: priceNumber,
          sortValue,
          color: resolveColor(occurrence),
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
      return a.label.localeCompare(b.label, "fr");
    });

    const labelMap = new Map();
    const aggregatedItems = [];

    items.forEach((item) => {
      const normalizedLabel = item.label.toLowerCase();
      let entry = labelMap.get(normalizedLabel);
      if (!entry) {
        entry = {
          key: normalizedLabel,
          baseLabel: item.label,
          icon: item.icon || null,
          price: 0,
          count: 0,
          color: item.color || null,
        };
        labelMap.set(normalizedLabel, entry);
        aggregatedItems.push(entry);
      }
      entry.price += item.price;
      entry.count += 1;
      if (!entry.icon && item.icon) {
        entry.icon = item.icon;
      }
      if (!entry.color && item.color) {
        entry.color = item.color;
      }
    });

    const total = aggregatedItems.reduce((sum, entry) => sum + entry.price, 0);

    return {
      total,
      items: aggregatedItems.map((entry, index) => ({
        id: `${entry.key}-${index}`,
        icon: entry.icon,
        color: entry.color,
        label:
          entry.count > 1
            ? `${entry.baseLabel} x${entry.count}`
            : entry.baseLabel,
        price: Math.round(entry.price * 100) / 100,
      })),
    };
  }, [sanitizedActiveTaskOccurrences]);

  const resolveDayIndexFromDate = useCallback((value) => {
    if (!value) {
      return null;
    }
    let candidate;
    if (value instanceof Date) {
      candidate = new Date(value.getTime());
    } else if (typeof value === "number" || typeof value === "string") {
      candidate = new Date(value);
    } else {
      return null;
    }
    if (Number.isNaN(candidate.getTime())) {
      return null;
    }
    const jsDay = candidate.getDay();
    if (jsDay === 0) {
      return 6;
    }
    return jsDay - 1;
  }, []);

  const formatDateOnly = useCallback((value) => {
    if (!value) {
      return null;
    }

    const candidate = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(candidate.getTime())) {
      return null;
    }

    candidate.setHours(0, 0, 0, 0);
    const year = candidate.getFullYear();
    const month = String(candidate.getMonth() + 1).padStart(2, "0");
    const day = String(candidate.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }, []);

  const normalizeDayDate = useCallback((value) => {
    if (!value) {
      return null;
    }
    const candidate = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(candidate.getTime())) {
      return null;
    }
    candidate.setHours(0, 0, 0, 0);
    return candidate;
  }, []);

  const isSameDayDate = useCallback(
    (a, b) => {
      const first = normalizeDayDate(a);
      const second = normalizeDayDate(b);
      if (!first || !second) {
        return false;
      }
      return first.getTime() === second.getTime();
    },
    [normalizeDayDate],
  );

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
        console.error("deleteWeeklyTask error", error);
        showToast("Erreur lors de la suppression de la tâche", true);
      } finally {
        setWeeklyTaskModal(createInitialWeeklyTaskModalState());
      }
    },
    [planningContext, planningTab, readOnly]
  );

  useEffect(() => {
    const cleanupFns = [];

    const unsubscribeOpen = subscribeToUIEvent("openTaskModal", (taskId) => {
      if (readOnly) {
        return;
      }
      if (!taskId) return;
      const original = activeWeeklyTasks.find((task) => task.id === taskId);
      if (original) {
        setWeeklyTaskModal({
          ...createInitialWeeklyTaskModalState(),
          open: true,
          task: original,
        });
      }
    });

    const unsubscribeDelete = subscribeToUIEvent(
      "confirmDeleteTask",
      (taskId) => {
        if (readOnly) {
          return;
        }
        const original = activeWeeklyTasks.find((task) => task.id === taskId);
        if (!original) {
          return;
        }
        const confirmed = window.confirm(
          `Supprimer la tâche "${original.label}" ?`
        );
        if (!confirmed) {
          return;
        }
        handleDeleteWeeklyTask(taskId);
      }
    );

    cleanupFns.push(unsubscribeOpen, unsubscribeDelete);

    return () => {
      cleanupFns.forEach((fn) => {
        if (typeof fn === "function") fn();
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

      setModal({
        open: true,
        event: null,
        selectedDate: baseDate,
        readOnly: false,
        initialLinkedTaskId: null,
      });
    },
    [readOnly, planningContext]
  );

  const openEventModal = useCallback(
    (event) => {
      if (!event) return;
      setModal({
        open: true,
        event,
        selectedDate: new Date(event.start),
        readOnly,
        initialLinkedTaskId: null,
      });
    },
    [readOnly]
  );

  const closeModal = useCallback(() => {
    setModal(createInitialEventModalState());
  }, []);

  const openWeeklyTaskModal = useCallback((defaultDate = null) => {
    if (
      readOnly ||
      !planningContext ||
      planningTab === TEAM_PLANNING_TAB_SHARED
    )
      return;
    const defaultDayIndex = resolveDayIndexFromDate(defaultDate);
    setWeeklyTaskModal({
      ...createInitialWeeklyTaskModalState(),
      open: true,
      defaultDayIndex,
    });
  }, [readOnly, planningContext, planningTab, resolveDayIndexFromDate]);

  const closeWeeklyTaskModal = useCallback(() => {
    setWeeklyTaskModal(createInitialWeeklyTaskModalState());
  }, []);

  const handleWeeklyTaskSaved = useCallback(
    (savedTask) => {
      closeWeeklyTaskModal();

      const rawLabel =
        typeof savedTask?.label === "string" ? savedTask.label.trim() : "";
      const message = rawLabel
        ? `Tâche "${rawLabel}" sauvegardée`
        : "Tâche hebdomadaire sauvegardée";

      showToast(message);
    },
    [closeWeeklyTaskModal]
  );

  const duplicateEventsForDay = useCallback(
    async (sourceDayIndex, targetDayIndex, targetDate) => {
      if (!planningContext) {
        return 0;
      }

      const eventsToCopy = Array.isArray(sanitizedActiveEvents)
        ? sanitizedActiveEvents.filter((slot) => {
            const startDate = getSlotStartDate(slot);
            return (
              startDate && resolveDayIndexFromDate(startDate) === sourceDayIndex
            );
          })
        : [];

      if (!eventsToCopy.length) {
        return 0;
      }

      let created = 0;

      for (const slot of eventsToCopy) {
        const startDate = getSlotStartDate(slot);
        const endDate = getSlotEndDate(slot);

        if (!startDate || !endDate || endDate <= startDate) {
          continue;
        }

        const typeValue =
          typeof slot.type === "string" ? slot.type.trim().toLowerCase() : "";

        if (["task", "weekly_task", "weekly-task"].includes(typeValue)) {
          continue;
        }

        const targetStart = new Date(targetDate);
        targetStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

        const targetEnd = new Date(targetDate);
        targetEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);

        if (targetEnd <= targetStart) {
          targetEnd.setTime(
            targetStart.getTime() +
              Math.max(endDate.getTime() - startDate.getTime(), 15 * 60 * 1000),
          );
        }

        const normalizedStatus =
          (typeof slot.payment_status === "string" && slot.payment_status.trim()) ||
          (typeof slot.status === "string" && slot.status.trim()) ||
          (typeValue === "absence" ? "not_worked" : "unpaid");

        const resolvedClientId =
          (typeof slot.client_id === "string" && slot.client_id.trim()) ||
          (typeof slot.clientId === "string" && slot.clientId.trim()) ||
          "";

        const resolvedClientName = [slot.client_name, slot.client, slot.title]
          .filter((candidate) => typeof candidate === "string" && candidate.trim())
          .map((candidate) => candidate.trim())[0];

        const payload = {
          start: targetStart.toISOString(),
          end: targetEnd.toISOString(),
          type: typeValue === "absence" ? "absence" : "normal",
          status: normalizedStatus,
          payment_status: normalizedStatus,
          client_id: resolvedClientId,
          client_name: resolvedClientName || "",
          client:
            typeValue === "absence"
              ? ""
              : resolvedClientName || slot.client || slot.title || "Bloc",
          description: typeof slot.description === "string" ? slot.description : "",
          color: slot.color || undefined,
          hourly_rate: slot.hourly_rate || slot.rate || slot.price_per_hour || 50,
          duration: Math.round((targetEnd - targetStart) / (60 * 1000)),
          task_id: typeValue === "absence" ? null : slot.task_id || slot.taskId || null,
          day: DAY_KEYS[targetDayIndex] || "monday",
          synced: false,
        };

        try {
          await saveEventNew(planningContext, payload);
          created += 1;
        } catch (error) {
          console.error("duplicateEventsForDay error", error);
        }
      }

      return created;
  },
    [
      sanitizedActiveEvents,
      planningContext,
      resolveDayIndexFromDate,
      saveEventNew,
    ],
  );

  const duplicateWeeklyTasksForDay = useCallback(
    async (sourceDayIndex, targetDayIndex, targetDate) => {
      if (!planningContext || planningTab === TEAM_PLANNING_TAB_SHARED) {
        return 0;
      }

      const targetDateIso = formatDateOnly(targetDate);

      const normalizeRangeDay = (range) => {
        if (!range) return null;
        const raw = range.day ?? range.dayIndex ?? range.weekday;
        if (typeof raw === "number") {
          if (raw >= 1 && raw <= 7) {
            return (raw + 6) % 7;
          }
          return raw >= 0 && raw <= 6 ? raw : null;
        }
        if (typeof raw === "string") {
          const trimmed = raw.trim().toLowerCase();
          if (/^\d+$/.test(trimmed)) {
            const numeric = parseInt(trimmed, 10);
            if (!Number.isNaN(numeric)) {
              if (numeric >= 1 && numeric <= 7) {
                return (numeric + 6) % 7;
              }
              if (numeric >= 0 && numeric <= 6) {
                return numeric;
              }
            }
          }
          const indexFromKey = DAY_KEYS.indexOf(trimmed);
          if (indexFromKey >= 0) {
            return indexFromKey;
          }
        }
        return null;
      };

      const tasksToDuplicate = Array.isArray(activeWeeklyTasks)
        ? activeWeeklyTasks.filter(
            (task) =>
              task &&
              Array.isArray(task.time_ranges) &&
              task.time_ranges.some((range) => normalizeRangeDay(range) === sourceDayIndex),
          )
        : [];

      if (!tasksToDuplicate.length) {
        return 0;
      }

      let created = 0;

      for (const task of tasksToDuplicate) {
        const rangesForDay = task.time_ranges.filter(
          (range) => normalizeRangeDay(range) === sourceDayIndex,
        );

        if (!rangesForDay.length) {
          continue;
        }

        const duplicatedRanges = rangesForDay.map((range) => ({
          ...range,
          day: targetDayIndex,
          weekday: targetDayIndex,
          task_date: targetDateIso,
          taskDate: targetDateIso,
          task_day_iso: targetDateIso,
          taskDayIso: targetDateIso,
          taskDayISO: null,
        }));

        const { id, occurrenceId, time_ranges, timeRanges, ...rest } = task;

        try {
          await saveWeeklyTask(planningContext, {
            ...rest,
            time_ranges: duplicatedRanges,
            weekday: targetDayIndex,
            task_date: targetDateIso ?? rest.task_date ?? rest.taskDate ?? null,
            task_day_iso:
              targetDateIso ?? rest.task_day_iso ?? rest.taskDayIso ?? null,
          });
          created += 1;
        } catch (error) {
          console.error("duplicateWeeklyTasksForDay error", error);
        }
      }

      return created;
    },
    [
      activeWeeklyTasks,
      formatDateOnly,
      planningContext,
      planningTab,
      saveWeeklyTask,
    ],
  );

  const handleSelectDayForDuplication = useCallback(
    (dayDate) => {
      if (readOnly || planningTab === TEAM_PLANNING_TAB_SHARED || !planningContext) {
        showToast(
          "La duplication n'est pas disponible dans ce mode ou en lecture seule",
          true,
        );
        return;
      }
      const normalized = normalizeDayDate(dayDate);
      if (!normalized) {
        return;
      }
      setDayDuplicationSource(normalized);

      const label = normalized.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
      showToast(`Journée sélectionnée : ${label}`);
    },
    [normalizeDayDate, planningContext, planningTab, readOnly, showToast],
  );

  const handleDuplicateDayToTarget = useCallback(
    async (targetDate) => {
      if (readOnly || planningTab === TEAM_PLANNING_TAB_SHARED || !planningContext) {
        showToast(
          "La duplication n'est pas disponible dans ce mode ou en lecture seule",
          true,
        );
        return;
      }

      const normalizedSource = normalizeDayDate(dayDuplicationSource);
      const normalizedTarget = normalizeDayDate(targetDate);

      if (!normalizedSource) {
        showToast("Sélectionnez d'abord la journée à dupliquer", true);
        return;
      }

      if (!normalizedTarget) {
        return;
      }

      if (isSameDayDate(normalizedSource, normalizedTarget)) {
        showToast("Choisissez une journée différente pour la duplication", true);
        return;
      }

      const sourceDayIndex = resolveDayIndexFromDate(normalizedSource);
      const targetDayIndex = resolveDayIndexFromDate(normalizedTarget);

      if (sourceDayIndex === null || targetDayIndex === null) {
        showToast("Jour de duplication invalide", true);
        return;
      }

      setIsDuplicatingDay(true);

      try {
        const [createdEvents, createdTasks] = await Promise.all([
          duplicateEventsForDay(sourceDayIndex, targetDayIndex, normalizedTarget),
          duplicateWeeklyTasksForDay(
            sourceDayIndex,
            targetDayIndex,
            normalizedTarget,
          ),
        ]);

        if (createdEvents === 0 && createdTasks === 0) {
          showToast("Aucun élément à dupliquer pour cette journée", true);
          return;
        }

        requestWeekSlotsRefresh(planningContext, weekStart, weekEnd);

        const eventLabel = createdEvents > 1 ? "blocs" : "bloc";
        const taskLabel = createdTasks > 1 ? "tâches" : "tâche";
        showToast(
          `Duplication terminée (${createdEvents} ${eventLabel}, ${createdTasks} ${taskLabel})`,
        );
      } catch (error) {
        console.error("handleDuplicateDayToTarget error", error);
        showToast("Impossible de dupliquer la journée", true);
      } finally {
        setIsDuplicatingDay(false);
      }
    },
    [
      dayDuplicationSource,
      duplicateEventsForDay,
      duplicateWeeklyTasksForDay,
      isSameDayDate,
      normalizeDayDate,
      planningContext,
      planningTab,
      readOnly,
      showToast,
      requestWeekSlotsRefresh,
      resolveDayIndexFromDate,
      weekEnd,
      weekStart,
    ],
  );

  const modalAttachedTasks = useMemo(() => {
    if (
      !modal.event ||
      !Array.isArray(modal.event.attachedTaskBadges) ||
      modal.event.attachedTaskBadges.length === 0
    ) {
      return [];
    }
    const uniqueTasks = [];
    const seen = new Set();
    modal.event.attachedTaskBadges.forEach((badge) => {
      if (!badge) {
        return;
      }
      const identifier =
        badge.taskId ?? badge.id ?? badge.task_id ?? badge.taskID ?? null;
      const matchedTask = findTaskByIdentifier(identifier);
      if (!matchedTask) {
        return;
      }
      const candidateKeys = [
        matchedTask.id,
        matchedTask.taskId,
        matchedTask.task_id,
        matchedTask.occurrenceId,
        matchedTask.occurrence_id,
        identifier,
      ]
        .map((value) => (value == null ? null : String(value).trim()))
        .filter(Boolean);
      const key = candidateKeys[0];
      if (key && seen.has(key)) {
        return;
      }
      if (key) {
        seen.add(key);
      }
      uniqueTasks.push(matchedTask);
    });
    return uniqueTasks;
  }, [findTaskByIdentifier, modal.event]);

  const handleLinkedTaskEdit = useCallback(
    (taskId) => {
      if (
        readOnly ||
        !planningContext ||
        planningTab === TEAM_PLANNING_TAB_SHARED ||
        !modalAttachedTasks.length
      ) {
        return;
      }
      const normalizedTarget =
        taskId == null ? "" : String(taskId).trim();
      let matchedTask = normalizedTarget
        ? findTaskByIdentifier(normalizedTarget)
        : null;
      if (!matchedTask) {
        matchedTask = modalAttachedTasks[0] || null;
      }
      if (!matchedTask) {
        return;
      }
      const linkedEvent = modal.event || null;
      const linkedEventReadOnly = modal.readOnly || false;
      const resolvedLinkedTaskId =
        matchedTask.id ||
        matchedTask.taskId ||
        matchedTask.task_id ||
        matchedTask.occurrenceId ||
        matchedTask.occurrence_id ||
        normalizedTarget ||
        null;
      setWeeklyTaskModal({
        ...createInitialWeeklyTaskModalState(),
        open: true,
        task: matchedTask,
        linkedEvent,
        linkedTaskId: resolvedLinkedTaskId,
        linkedEventReadOnly,
        linkedTasks: modalAttachedTasks,
      });
    },
    [
      findTaskByIdentifier,
      planningContext,
      planningTab,
      readOnly,
      modal.event,
      modal.readOnly,
      modalAttachedTasks,
    ]
  );

  const handleReturnToLinkedTasks = useCallback(() => {
    const eventToReopen = weeklyTaskModal.linkedEvent;
    const linkedTaskId = weeklyTaskModal.linkedTaskId || null;
    const linkedEventReadOnly = weeklyTaskModal.linkedEventReadOnly || false;
    closeWeeklyTaskModal();
    if (!eventToReopen) {
      return;
    }
    const selectedDate = eventToReopen?.start
      ? new Date(eventToReopen.start)
      : null;
    setModal((current) => {
      const currentEvent = current?.event || null;
      const currentEventId =
        currentEvent?.id == null
          ? null
          : String(currentEvent.id).trim();
      const reopeningEventId =
        eventToReopen?.id == null
          ? null
          : String(eventToReopen.id).trim();
      const isSameEvent =
        Boolean(current.open && currentEvent && eventToReopen) &&
        (currentEvent === eventToReopen ||
          (currentEventId && reopeningEventId &&
            currentEventId === reopeningEventId));

      if (isSameEvent) {
        return {
          ...current,
          readOnly: linkedEventReadOnly || current.readOnly || readOnly,
          initialLinkedTaskId: linkedTaskId,
        };
      }

      return {
        open: true,
        event: eventToReopen,
        selectedDate,
        readOnly: linkedEventReadOnly || readOnly,
        initialLinkedTaskId: linkedTaskId,
      };
    });
  }, [
    closeWeeklyTaskModal,
    readOnly,
    setModal,
    weeklyTaskModal.linkedEvent,
    weeklyTaskModal.linkedTaskId,
    weeklyTaskModal.linkedEventReadOnly,
  ]);

  const handleWeeklyTaskSwitchToEvent = useCallback(() => {
    if (weeklyTaskModal.linkedEvent) {
      handleReturnToLinkedTasks();
      return;
    }

    closeWeeklyTaskModal();
    openCreateModal();
  }, [
    closeWeeklyTaskModal,
    handleReturnToLinkedTasks,
    openCreateModal,
    weeklyTaskModal.linkedEvent,
  ]);

  const handleLinkedTaskSelectionChange = useCallback(
    (taskId) => {
      setWeeklyTaskModal((current) => ({
        ...current,
        linkedTaskId: taskId || null,
      }));
    },
    [setWeeklyTaskModal],
  );

  const handleInvoiceShortcut = useCallback(
    (clientSummary) => {
      if (!clientSummary?.clientId) {
        showToast(
          "Impossible d'ouvrir la création de facture pour ce client",
          true
        );
        return;
      }
      const safeTasks = Array.isArray(clientSummary.tasks)
        ? clientSummary.tasks.map((task) => ({
            id: task?.id || task?.taskId || task?.occurrenceId || undefined,
            label:
              typeof task?.label === "string" && task.label.trim()
                ? task.label.trim()
                : "Tâche",
            price: Number(task?.price) || 0,
          }))
        : [];
      const tasksTotal = safeTasks.reduce(
        (sum, task) => (Number.isFinite(task.price) ? sum + Math.max(task.price, 0) : sum),
        0
      );
      persistInvoiceSeed({
        clientId: clientSummary.clientId,
        clientLabel: clientSummary.clientLabel,
        totalHours: Number(clientSummary.totalHours) || 0,
        totalAmount: Number(clientSummary.totalAmount) || 0,
        tasks: safeTasks,
        periodLabel: formatMonthLabel(currentDate),
        periodStart:
          currentMonthRange?.from instanceof Date
            ? currentMonthRange.from.toISOString()
            : null,
        servicesAmount: Math.max(0, (Number(clientSummary.totalAmount) || 0) - tasksTotal),
      });
      const params = new URLSearchParams();
      params.set("tab", "factures");
      params.set("create", "true");
      params.set("client", clientSummary.clientId);
      navigate(`/documents?${params.toString()}`);
    },
    [navigate, currentDate, currentMonthRange]
  );

  const handleSaveEvent = useCallback(
    async (data) => {
      if (!data) {
        return;
      }

      const resolveEventId = (value) => {
        if (!value || typeof value !== "object") {
          return null;
        }

        const candidateKeys = [
          "id",
          "eventId",
          "event_id",
          "uid",
          "_id",
          "sourceId",
        ];

        for (const key of candidateKeys) {
          const candidate = value?.[key];
          if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
          }
        }

        return null;
      };

      const dayIndex = data.day ?? data.dayIndex ?? 0;
      const eventDate = new Date(weekStart);
      eventDate.setDate(weekStart.getDate() + dayIndex);
      const [startHour, startMinute] = toTimeString(data.start || DEFAULT_START)
        .split(":")
        .map(Number);
      const [endHour, endMinute] = toTimeString(data.end || DEFAULT_END)
        .split(":")
        .map(Number);

      const start = new Date(eventDate);
      start.setHours(startHour, startMinute, 0, 0);
      let end = new Date(eventDate);
      end.setHours(endHour, endMinute, 0, 0);

      if (end <= start) {
        showToast("L'heure de fin doit être après l'heure de début", true);
        return;
      }

      const rawType =
        typeof data.type === "string" ? data.type.trim().toLowerCase() : "";
      const eventType = rawType === "absence" ? "absence" : "normal";

      const paymentStatusCandidates = [
        data.payment_status,
        data.status,
        data.paymentStatus,
      ];
      let resolvedStatus = eventType === "absence" ? "not_worked" : "unpaid";
      for (const candidate of paymentStatusCandidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          resolvedStatus = candidate.trim();
          break;
        }
      }

      const shouldClearClient = eventType === "absence";
      const sanitizedClientId = shouldClearClient ? "" : data.client_id || "";
      const sanitizedClientName = shouldClearClient
        ? ""
        : data.client_name || "";
      const normalizedClientId =
        typeof sanitizedClientId === "string"
          ? sanitizedClientId.trim()
          : "";
      const normalizedClientName =
        typeof sanitizedClientName === "string"
          ? sanitizedClientName.trim()
          : "";
      const normalizedDescription =
        typeof data.description === "string" ? data.description.trim() : "";
      const resolvedTitle =
        normalizedDescription ||
        data.title ||
        normalizedClientName ||
        "Bloc";

      if (planningTab === TEAM_PLANNING_TAB_SHARED) {
        if (!user?.uid || !sharedTeamId) {
          closeModal();
          return;
        }

        try {
          const resolvePersonalEventId = () => {
            const candidateKeys = [
              "personalEventId",
              "personal_event_id",
              "personalEventID",
              "personal_eventID",
              "personalEvent",
              "personal_event",
            ];
            for (const key of candidateKeys) {
              const value = data?.[key];
              if (typeof value === "string" && value.trim()) {
                return value.trim();
              }
            }
            if (typeof data?.id === "string" && data.id.trim()) {
              return data.id.trim();
            }
            return null;
          };

          const _startMs = start.getTime();
          const _endMs = end.getTime();
          if (!Number.isFinite(_startMs) || !Number.isFinite(_endMs)) {
            console.error("Invalid dates for team event", {
              startValue: data.start,
              endValue: data.end,
            });
            showToast(
              "Créneau invalide : merci de choisir des horaires valides",
              true,
            );
            setIsTransferringSoloWeek(false);
            setDayDuplicationSource(null);
            setIsDuplicatingDay(false);
            closeModal();
            return;
          }
          if (_endMs <= _startMs) {
            end = new Date(_startMs + 15 * 60 * 1000);
          }

          const teamTitle = (resolvedTitle || "").trim();

          const teamPayload = {
            id: data.teamPlanningId || data.team_planning_id || null,
            title: teamTitle,
            type: "event",
            start: start.toISOString(),
            end: end.toISOString(),
            status: resolvedStatus,
            color: data.color || "#2563eb",
            price: Number.isFinite(Number(data.price))
              ? Number(data.price)
              : null,
            description: normalizedDescription || null,
            clientId: normalizedClientId || null,
            clientName: normalizedClientName || null,
            createdBy: user.uid,
            createdByName: user.displayName || user.email || "Moi",
            createdByInitials: computeInitials(user.displayName, user.email),
            teamId: sharedTeamId,
            synced: Boolean(data.synced),
            personalEventId: data.personalEventId || data.id || null,
          };

          console.log("[TEAM POST]", teamPayload);

          const response = await apiFetch(`/teams/${sharedTeamId}/planning`, {
            method: "POST",
            body: JSON.stringify(teamPayload),
          });

          const teamEntryId = response?.item?.id || teamPayload.id || null;

          requestTeamPlanningRefresh();

          const personalPayload = {
            id: resolvePersonalEventId(),
            start: start.toISOString(),
            end: end.toISOString(),
            type: eventType,
            client: shouldClearClient
              ? ""
              : normalizedClientName || resolvedTitle,
            status: resolvedStatus,
            payment_status: resolvedStatus,
            hourly_rate: shouldClearClient ? 0 : data.hourly_rate || 50,
            duration: Math.round((end - start) / (60 * 1000)),
            task_id: shouldClearClient ? null : data.task_id || null,
            description: normalizedDescription || "",
            client_id: normalizedClientId,
            client_name: normalizedClientName,
            day: DAY_KEYS[dayIndex] || "monday",
            team_planning_id: teamEntryId,
            synced: true,
          };

          if (!data.synced && user?.uid) {
            let syncedPersonalId = personalPayload.id || null;
            try {
              const syncedEvent = await saveEventNew(
                { type: "personal", userId: user.uid },
                personalPayload
              );
              syncedPersonalId = syncedEvent?.id || personalPayload.id || null;
              if (syncedPersonalId) {
                personalPayload.id = syncedPersonalId;
              }
              requestWeekSlotsRefresh(
                { type: "personal", userId: user.uid },
                weekStart,
                weekEnd
              );
            } catch (syncError) {
              console.warn(
                "Unable to synchronise personal planning from team event",
                syncError
              );
            }

            if (syncedPersonalId && teamEntryId) {
              try {
                await apiFetch(`/teams/${sharedTeamId}/planning`, {
                  method: "POST",
                  body: JSON.stringify({
                    ...teamPayload,
                    id: teamEntryId,
                    synced: true,
                    personalEventId: syncedPersonalId,
                  }),
                });
              } catch (linkError) {
                console.warn(
                  "Unable to associer le bloc équipe à votre événement personnel",
                  linkError
                );
              }
            }
          } else if (personalPayload.id && user?.uid) {
            try {
              await saveEventNew(
                { type: "personal", userId: user.uid },
                personalPayload
              );
              requestWeekSlotsRefresh(
                { type: "personal", userId: user.uid },
                weekStart,
                weekEnd
              );
            } catch (updateError) {
              console.warn(
                "Unable to update personal event linked to team block",
                updateError
              );
            }
          }

          showToast("Bloc d'équipe enregistré avec succès");
        } catch (error) {
          const readableError =
            (error &&
              typeof error === "object" &&
              error !== null &&
              "detail" in error &&
              error.detail) ||
            error;
          console.log("[TEAM ERR]", readableError);
          const msg =
            (error &&
              typeof error === "object" &&
              error !== null &&
              "detail" in error &&
              error.detail) ||
            (error &&
              typeof error === "object" &&
              error !== null &&
              "message" in error &&
              error.message) ||
            (typeof error === "string" ? error : null) ||
            "Échec de l'enregistrement";
          showToast(msg, true);
        } finally {
          closeModal();
        }
        return;
      }

      if (!planningContext || readOnly || modal.readOnly) {
        return;
      }

      try {
        const fallbackId = resolveEventId(data) || resolveEventId(modal.event);
        const overlappingId =
          fallbackId || findOverlappingEventIds(start, end)[0] || null;

        const payload = {
          id: overlappingId,
          start: start.toISOString(),
          end: end.toISOString(),
          type: eventType,
          client: shouldClearClient ? "" : sanitizedClientName || resolvedTitle,
          status: resolvedStatus,
          payment_status: resolvedStatus,
          hourly_rate: shouldClearClient ? 0 : data.hourly_rate || 50,
          duration: Math.round((end - start) / (60 * 1000)),
          task_id: shouldClearClient ? null : data.task_id || null,
          description: data.description || "",
          client_id: sanitizedClientId,
          client_name: sanitizedClientName,
          day: DAY_KEYS[dayIndex] || "monday",
          team_planning_id:
            data.teamPlanningId || data.team_planning_id || null,
          synced: Boolean(data.synced),
        };

        const saved = await saveEventNew(planningContext, payload);
        const savedId = saved?.id || payload.id || fallbackId || null;

        if (savedId) {
          const conflicts = findOverlappingEventIds(start, end, savedId);
          if (Array.isArray(conflicts) && conflicts.length > 0) {
            await Promise.allSettled(
              conflicts.map((conflictId) =>
                deleteEventNew(planningContext, conflictId).catch((error) => {
                  console.warn("Unable to delete overlapping event", error);
                })
              )
            );
          }
        }

        requestWeekSlotsRefresh(planningContext, weekStart, weekEnd);

        showToast("Événement sauvegardé avec succès");
      } catch (error) {
        console.error("saveEventNew error", error);
        showToast("Erreur lors de la sauvegarde", true);
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
      findOverlappingEventIds,
      deleteEventNew,
      closeModal,
      sharedTeamId,
      user?.uid,
      user?.displayName,
      user?.email,
    ]
  );

  const handleTransferSoloWeekToTeam = useCallback(async () => {
    if (
      planningTab === TEAM_PLANNING_TAB_SHARED ||
      !sharedTeamId ||
      !planningContext ||
      readOnly ||
      isTransferringSoloWeek
    ) {
      return;
    }

    if (!Array.isArray(events) || events.length === 0) {
      showToast(
        "Aucun événement du planning solo n'est disponible pour le transfert",
        true
      );
      return;
    }

    const eligibleEvents = events
      .map((slot) => {
        if (!slot) {
          return null;
        }

        const type =
          typeof slot.type === "string" ? slot.type.trim().toLowerCase() : "";
        if (type === "absence" || type === "task" || type === "weekly_task" || type === "weekly-task") {
          return null;
        }

        const alreadySynced =
          slot.synced === true ||
          Boolean(slot.team_planning_id) ||
          Boolean(slot.teamPlanningId);
        if (alreadySynced) {
          return null;
        }

        const startDate = getSlotStartDate(slot);
        const endDate = getSlotEndDate(slot);
        if (!startDate || !endDate || endDate <= startDate) {
          return null;
        }

        const statusCandidates = [
          slot.payment_status,
          slot.paymentStatus,
          slot.status,
        ];
        let status = "unpaid";
        for (const candidate of statusCandidates) {
          if (typeof candidate === "string" && candidate.trim()) {
            status = candidate.trim();
            break;
          }
        }

        const titleCandidates = [
          slot.description,
          slot.title,
          slot.client_name,
          slot.clientName,
          slot.client?.display_name,
          slot.client?.name,
          slot.client,
        ];
        let title = "Bloc";
        for (const candidate of titleCandidates) {
          if (typeof candidate === "string" && candidate.trim()) {
            title = candidate.trim();
            break;
          }
        }

        const clientIdCandidates = [
          slot.client_id,
          slot.clientId,
          slot.client?.id,
          slot.client?.client_id,
        ];
        let clientId = null;
        for (const candidate of clientIdCandidates) {
          if (candidate == null) {
            continue;
          }
          const normalized = String(candidate).trim();
          if (normalized) {
            clientId = normalized;
            break;
          }
        }

        const clientNameCandidates = [
          slot.client_name,
          slot.clientName,
          slot.client_label,
          slot.clientLabel,
          typeof slot.client === "string" ? slot.client : null,
          slot.client?.display_name,
          slot.client?.name,
        ];
        let clientName = "";
        for (const candidate of clientNameCandidates) {
          if (typeof candidate === "string" && candidate.trim()) {
            clientName = candidate.trim();
            break;
          }
        }

        const normalizedDescription =
          typeof slot.description === "string" ? slot.description.trim() : "";

        const priceCandidates = [
          slot.price,
          slot.total,
          slot.amount,
          slot.value,
          slot.hourly_rate,
          slot.hourlyRate,
        ];
        let price = null;
        for (const candidate of priceCandidates) {
          const numeric = Number(candidate);
          if (Number.isFinite(numeric)) {
            price = numeric;
            break;
          }
        }

        const personalEventId =
          typeof slot.id === "string" && slot.id.trim() ? slot.id.trim() : null;

        const creatorName = user?.displayName || user?.email || "Moi";

        return {
          personalEventId,
          payload: {
            id: slot.teamPlanningId || slot.team_planning_id || null,
            title,
            type: "event",
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            status,
            color:
              (typeof slot.color === "string" && slot.color.trim()) ||
              "#2563eb",
            price,
            description: normalizedDescription || null,
            clientId,
            clientName: clientName || null,
            createdBy: user?.uid || null,
            createdByName: creatorName,
            createdByInitials: computeInitials(user?.displayName, user?.email),
            teamId: sharedTeamId,
            synced: true,
            personalEventId,
          },
        };
      })
      .filter(Boolean);

    if (!eligibleEvents.length) {
      showToast(
        "Aucun nouvel événement à transférer vers le planning d'équipe",
        true
      );
      return;
    }

    setIsTransferringSoloWeek(true);
    try {
      let transferredCount = 0;
      for (const entry of eligibleEvents) {
        const response = await apiFetch(`/teams/${sharedTeamId}/planning`, {
          method: "POST",
          body: JSON.stringify(entry.payload),
        });
        transferredCount += 1;

        if (response?.item?.id && entry.personalEventId) {
          try {
            await saveEventNew(planningContext, {
              id: entry.personalEventId,
              team_planning_id: response.item.id,
              synced: true,
            });
          } catch (attachError) {
            console.warn(
              "Unable to attach team planning identifier during transfer",
              attachError
            );
          }
        }
      }

      requestTeamPlanningRefresh();
      requestWeekSlotsRefresh(planningContext, weekStart, weekEnd);

      showToast(
        transferredCount > 1
          ? `${transferredCount} événements transférés vers le planning d'équipe`
          : "Événement transféré vers le planning d'équipe"
      );
    } catch (error) {
      console.error("solo planning transfer error", error);
      showToast(
        "Impossible de transférer le planning solo vers le planning d'équipe",
        true
      );
    } finally {
      setIsTransferringSoloWeek(false);
    }
  }, [
    planningTab,
    sharedTeamId,
    planningContext,
    readOnly,
    isTransferringSoloWeek,
    events,
    user?.displayName,
    user?.email,
    user?.uid,
    requestTeamPlanningRefresh,
    requestWeekSlotsRefresh,
    weekStart,
    weekEnd,
  ]);

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
          await apiFetch(`/teams/${sharedTeamId}/planning/${id}`, {
            method: "DELETE",
          });
          requestTeamPlanningRefresh();

          const personalId =
            modal.event?.personalEventId ||
            modal.event?.team_planning_id ||
            null;
          if (personalId && user?.uid) {
            try {
              await deleteEventNew(
                { type: "personal", userId: user.uid },
                personalId
              );
              requestWeekSlotsRefresh(
                { type: "personal", userId: user.uid },
                weekStart,
                weekEnd
              );
            } catch (personalError) {
              console.warn(
                "Unable to delete personal event linked to team block",
                personalError
              );
            }
          }

          showToast("Bloc d'équipe supprimé");
        } catch (error) {
          console.error("team planning delete error", error);
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
        showToast("Événement supprimé avec succès");
      } catch (error) {
        console.error("deleteEventNew error", error);
        showToast("Erreur lors de la suppression", true);
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
    setCurrentDateSafe(new Date());
  }, [setCurrentDateSafe]);

  const goToPrevious = useCallback(() => {
    setCurrentDateSafe((date) =>
      view === "week"
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7)
        : new Date(date.getFullYear(), date.getMonth() - 1, 1)
    );
  }, [setCurrentDateSafe, view]);

  const goToNext = useCallback(() => {
    setCurrentDateSafe((date) =>
      view === "week"
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7)
        : new Date(date.getFullYear(), date.getMonth() + 1, 1)
    );
  }, [setCurrentDateSafe, view]);

  const currentLabel =
    view === "week"
      ? formatWeekLabel(currentDate)
      : formatMonthLabel(currentDate);

  const taskSources = sanitizedActiveTaskOccurrences;

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
    if (!teamMembershipAllowed) {
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
    teamMembershipAllowed,
    members,
    membersLoading,
    membersError,
  ]);

  const teamPlanningServiceUnavailable =
    isMembershipServiceUnavailableError(teamPlanningError);

  const teamPlanningErrorMessage = (() => {
    if (!teamPlanningError) {
      return null;
    }

    if (teamPlanningServiceUnavailable) {
      return "Service d'équipe momentanément indisponible — nouvelle tentative…";
    }

    if (typeof teamPlanningError === "string") {
      return teamPlanningError;
    }

    if (
      typeof teamPlanningError?.message === "string" &&
      teamPlanningError.message.trim().length > 0
    ) {
      return teamPlanningError.message;
    }

    const responseData = teamPlanningError?.response?.data;
    if (
      responseData &&
      typeof responseData === "object" &&
      typeof responseData.message === "string" &&
      responseData.message.trim().length > 0
    ) {
      return responseData.message;
    }

    if (
      responseData &&
      typeof responseData === "object" &&
      typeof responseData.detail === "string" &&
      responseData.detail.trim().length > 0
    ) {
      return responseData.detail;
    }

    return "Impossible de charger le planning d'équipe";
  })();

  const monthlyClientsLoading =
    planningTab === TEAM_PLANNING_TAB_SHARED
      ? teamPlanningLoading
      : personalMonthEventsLoading;

  const monthlyClientsError =
    planningTab === TEAM_PLANNING_TAB_SHARED
      ? teamPlanningErrorMessage
      : personalMonthEventsError;

  const pageTitle =
    planningTab === TEAM_PLANNING_TAB_SHARED
      ? sharedTeamName
        ? `Planning ${sharedTeamName}`
        : "Planning d'équipe"
      : isTeamContext && resolvedTeamName
        ? `Planning ${resolvedTeamName}`
        : isTeamContext
          ? "Planning solo"
          : "Mon planning";

  const subtitle =
    planningTab === TEAM_PLANNING_TAB_SHARED
      ? "Planifiez les créneaux partagés de votre équipe en temps réel"
      : isTeamContext
        ? "Consultez et organisez les plannings de votre équipe"
        : "Gérez vos événements et vos tâches hebdomadaires";
  const canTransferSoloWeek =
    isTeamContext &&
    !!sharedTeamId &&
    planningTab !== TEAM_PLANNING_TAB_SHARED &&
    !readOnly &&
    Boolean(planningContext);
  const transferButtonDisabled =
    !canTransferSoloWeek ||
    isTransferringSoloWeek ||
    eventsLoading ||
    !Array.isArray(events) ||
    events.length === 0;
  const transferButtonLabel = isTransferringSoloWeek
    ? "Transfert en cours…"
    : "Transférer ma semaine vers l'équipe";

  const renderTransferButtonContent = () => (
    <div className="flex flex-col items-center gap-1 text-blue-600 dark:text-blue-200">
      <span className="sr-only">{transferButtonLabel}</span>
      <div className="flex items-center justify-center gap-1">
        {isTransferringSoloWeek ? (
          <TransferSpinnerIcon className="h-5 w-5" />
        ) : (
          <>
            <TransferCalendarIcon className="h-4 w-4" />
            <TransferArrowIcon className="h-4 w-4" />
            <TransferTeamIcon className="h-4 w-4" />
          </>
        )}
      </div>
      <p className="text-[10px] font-medium leading-tight text-current">
        Transférer ma semaine vers l'équipe
      </p>
    </div>
  );

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <header className="space-y-2">
          <SectionHeaderRow
            headingLevel={1}
            icon={<Calendar aria-hidden="true" className="h-6 w-6" />}
            iconClassName="text-gray-900 dark:text-slate-100"
            title={pageTitle}
            titleClassName="text-2xl font-semibold text-gray-900 dark:text-slate-100"
            className="items-start gap-3"
          />
          <p className="text-sm text-gray-600 dark:text-slate-300">
            {subtitle}
          </p>
          {eventsError && planningTab !== TEAM_PLANNING_TAB_SHARED && (
            <p className="text-sm text-red-600">{eventsError}</p>
          )}
          {tasksError && planningTab !== TEAM_PLANNING_TAB_SHARED && (
            <p className="text-sm text-red-600">{tasksError}</p>
          )}
          {teamPlanningErrorMessage &&
            planningTab === TEAM_PLANNING_TAB_SHARED && (
              <p
                className={
                  teamPlanningServiceUnavailable
                    ? "text-sm text-slate-500 italic"
                    : "text-sm text-red-600"
                }
              >
                {teamPlanningErrorMessage}
              </p>
            )}
          {membersError && (
            <p className="text-sm text-red-600">{membersError}</p>
          )}
        </header>

        {isTeamContext &&
          (sharedTeamId ||
            (Array.isArray(availableTeams) && availableTeams.length > 0)) && (
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
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                    : "bg-transparent text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/40"
                }`}
              >
                {isTeamContext ? "Planning solo" : "Mon planning"}
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
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                      : "bg-transparent text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/40"
                  } ${sharedTeamId ? "" : "cursor-not-allowed opacity-60"}`}
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
            <label
              htmlFor="team-member-select"
              className="text-sm font-medium text-gray-700 dark:text-slate-200"
            >
              Voir le planning de :
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select
                id="team-member-select"
                value={selectedMemberId || ""}
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
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <button
            type="button"
            onClick={!readOnly ? () => openCreateModal() : undefined}
            disabled={readOnly || !planningContext}
            aria-disabled={readOnly || !planningContext}
            className={PRIMARY_ACTION_BUTTON_CLASSES}
          >
            + Créer
          </button>
          {canTransferSoloWeek && (
            <button
              type="button"
              onClick={handleTransferSoloWeekToTeam}
              disabled={transferButtonDisabled}
              aria-disabled={transferButtonDisabled}
              aria-label={transferButtonLabel}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm transition-colors transition-shadow duration-150 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:border-blue-400 dark:text-blue-200 dark:hover:bg-blue-500/10 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {renderTransferButtonContent()}
            </button>
          )}
        </div>
      </div>

      {canTransferSoloWeek && (
        <div className="flex flex-wrap items-center justify-end gap-2 md:hidden">
          <button
            type="button"
            onClick={handleTransferSoloWeekToTeam}
            disabled={transferButtonDisabled}
            aria-disabled={transferButtonDisabled}
            aria-label={transferButtonLabel}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm transition-colors transition-shadow duration-150 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:border-blue-400 dark:text-blue-200 dark:hover:bg-blue-500/10 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {renderTransferButtonContent()}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg shadow-slate-900/10 transition-colors transition-shadow duration-200 dark:border-slate-800 dark:bg-slate-900">
        {view === "week" ? (
          <PlannerGrid
            events={sanitizedActiveEvents}
            tasks={taskSources}
            weekStart={weekStart}
            onSlotSelect={(date) => openCreateModal(date)}
            onAddEvent={(date) => openCreateModal(date)}
            onEventClick={openEventModal}
            onTaskClick={(occurrence) => {
              if (readOnly) return;
              const original = weeklyTasks.find(
                (task) => task.id === occurrence.taskId
              );
              if (original) {
                setWeeklyTaskModal({
                  ...createInitialWeeklyTaskModalState(),
                  open: true,
                  task: original,
                });
              }
            }}
            isReadOnlyMode={readOnly}
            duplicationSourceDate={dayDuplicationSource}
            onDayCopy={handleSelectDayForDuplication}
            onDayDuplicate={handleDuplicateDayToTarget}
            isDuplicatingDay={isDuplicatingDay}
          />
          ) : (
            <MonthGrid
              year={currentDate.getFullYear()}
              month={currentDate.getMonth()}
              onDateSelect={(date) => {
                handleViewChange("week");
                setCurrentDateSafe(date);
              }}
              onEventClick={openEventModal}
              onCreateEvent={openCreateModal}
              context={
                planningTab === TEAM_PLANNING_TAB_SHARED ? null : planningContext
              }
              staticEvents={
                planningTab === TEAM_PLANNING_TAB_SHARED
                  ? teamMonthEvents
                  : undefined
              }
              staticTasks={
                planningTab === TEAM_PLANNING_TAB_SHARED
                  ? teamMonthTasks
                  : isTeamContext
                    ? teamSoloMonthTasks
                    : undefined
              }
            />
          )}

        <div className="mt-6 md:mt-4 lg:mt-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Récapitulatif
            </h2>
            <div
              role="tablist"
              aria-label="Récapitulatif planning"
              className="flex flex-wrap gap-2"
            >
              <button
                type="button"
                role="tab"
                aria-selected={recapViewTab === "amounts"}
                onClick={() => setRecapViewTab("amounts")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  recapViewTab === "amounts"
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-slate-200/80 text-slate-700 hover:bg-slate-300 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/70"
                }`}
              >
                Montants
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={recapViewTab === "clients"}
                onClick={() => setRecapViewTab("clients")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  recapViewTab === "clients"
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-slate-200/80 text-slate-700 hover:bg-slate-300 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/70"
                }`}
              >
                Clients du mois
              </button>
            </div>
          </div>

          {recapViewTab === "amounts" ? (
            <>
              {clientsLoading && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Chargement des taux clients…
                </p>
              )}
              {clientsError && !clientsLoading && (
                <p
                  className="mt-2 text-xs text-red-500 dark:text-red-400"
                  role="alert"
                >
                  {clientsError}
                </p>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {summaryCards.map((card) => (
                  <StatusSummaryCard
                    key={card.key}
                    variant={card.variant}
                    label={card.label}
                    amount={currencyFormatter.format(card.amount)}
                    data-testid={card.testId}
                  />
                ))}
                <div
                  className={`rounded-xl border px-4 py-3 text-sm shadow-sm transition-colors ${
                    tasksSummary.items.length > 0
                      ? "border-sky-200/70 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10"
                      : "border-slate-200/70 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40"
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
                          colorKey={item.color}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Clients du mois
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatMonthLabel(currentDate)}
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tâches affichées uniquement lorsqu'elles chevauchent un créneau client.
                </p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatusSummaryCard
                  variant="info"
                  label="Total du mois"
                  amount={currencyFormatter.format(monthlyClientsTotals.totalAmount)}
                  data-testid="planning-recap-clients-total"
                />
              </div>
              {monthlyUnattachedTasksSummary.items.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Tâches non rattachées
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Tâches du mois sans client associé.
                      </p>
                    </div>
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {currencyFormatter.format(monthlyUnattachedTasksSummary.total)}
                    </p>
                  </div>
                  <div className="mt-3 space-y-2" role="list">
                    {monthlyUnattachedTasksSummary.items.map((task) => (
                      <TaskSummaryRow
                        key={task.id}
                        iconId={task.icon}
                        label={task.label}
                        price={currencyFormatter.format(task.price)}
                        colorKey={task.color}
                      />
                    ))}
                  </div>
                </div>
              )}
              {monthlyClientsLoading && (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Analyse des clients…
                </p>
              )}
              {monthlyClientsError && !monthlyClientsLoading && (
                <p
                  className="mt-3 text-sm text-red-500 dark:text-red-400"
                  role="alert"
                >
                  {monthlyClientsError}
                </p>
              )}
              {!monthlyClientsLoading &&
                monthlyClientSummaries.length === 0 &&
                !monthlyClientsError && (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                    Aucun client facturable identifié pour ce mois.
                  </p>
                )}
              {monthlyClientSummaries.length > 0 && (
                <div className="mt-4 space-y-4" role="list">
                  {monthlyClientSummaries.map((client) => {
                    const palette = generateMemberColor(
                      client.clientId || client.clientLabel
                    );
                    const initials = computeInitials(
                      client.clientLabel,
                      client.clientLabel
                    );
                    return (
                      <div
                        key={client.key}
                        role="listitem"
                        className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold uppercase"
                              style={{
                                backgroundColor: palette.background,
                                color: palette.text,
                                borderColor: palette.border,
                              }}
                            >
                              {initials}
                            </span>
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {client.clientLabel}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:gap-6">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Heures
                              </p>
                              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                {formatHoursDuration(client.totalHours)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Montant
                              </p>
                              <p className="text-base font-semibold text-emerald-600 dark:text-emerald-300">
                                {currencyFormatter.format(client.totalAmount)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleInvoiceShortcut(client)}
                              className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-blue-300 dark:focus-visible:ring-offset-slate-900"
                              disabled={!client.clientId}
                            >
                              Créer une facture
                            </button>
                          </div>
                        </div>
                        {client.tasks.length > 0 && (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Tâches associées
                            </p>
                            <ul className="mt-2 space-y-1">
                              {client.tasks.map((task) => (
                                <li
                                  key={task.id}
                                  className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-200"
                                >
                                  <span className="truncate">{task.label}</span>
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                                    {currencyFormatter.format(task.price)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {showTeamWeeklyTasksEmptyState && (
          <p
            className="mt-2 text-xs text-slate-500 dark:text-slate-400"
            role="status"
          >
            Aucune tâche partagée avec l'équipe pour cette semaine.
          </p>
        )}

        {/* Daily Todo Section - Only visible in week view */}
        {view === "week" &&
          planningTab !== TEAM_PLANNING_TAB_SHARED &&
          selectedMemberId && (
            <div className="mt-6 md:mt-4 lg:mt-3">
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
          <div className="mt-4 text-sm text-gray-500 dark:text-slate-400">
            Chargement des données…
          </div>
        )}
      </div>

      <EventModal
        isOpen={modal.open}
        onClose={closeModal}
        selectedDate={modal.selectedDate}
        event={modal.event}
        readOnly={modal.readOnly || readOnly}
        initialLinkedTaskId={modal.initialLinkedTaskId}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        attachedTasks={modalAttachedTasks}
        onEditLinkedTask={
          planningTab === TEAM_PLANNING_TAB_SHARED || !planningContext
            ? undefined
            : handleLinkedTaskEdit
        }
        onSwitchToTask={
          !readOnly &&
          planningContext &&
          planningTab !== TEAM_PLANNING_TAB_SHARED
            ? () => {
                const defaultDate = modal.selectedDate || null;
                closeModal();
                openWeeklyTaskModal(defaultDate);
              }
            : undefined
        }
      />

      <WeeklyTaskModal
        isOpen={weeklyTaskModal.open}
        task={weeklyTaskModal.task}
        onSave={handleWeeklyTaskSaved}
        onClose={closeWeeklyTaskModal}
        onDelete={
          !readOnly
            ? (task) => task?.id && handleDeleteWeeklyTask(task.id)
            : undefined
        }
        context={planningContext}
        readOnly={readOnly}
        weekStartISO={weekStartISO}
        defaultDayIndex={weeklyTaskModal.defaultDayIndex}
        onSwitchToEvent={
          !readOnly && planningContext
            ? handleWeeklyTaskSwitchToEvent
            : undefined
        }
        onReturnToLinkedTasks={
          weeklyTaskModal.linkedEvent ? handleReturnToLinkedTasks : undefined
        }
        linkedTasks={weeklyTaskModal.linkedTasks}
        initialLinkedTaskId={weeklyTaskModal.linkedTaskId}
        onLinkedTaskSelectionChange={handleLinkedTaskSelectionChange}
        availableTasks={weeklyTasks}
      />
    </div>
  );
}
