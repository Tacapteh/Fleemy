import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useId,
} from "react";
import useTeam from "./hooks/useTeam";
import "./App.css";
import { apiFetch } from "./lib/api";
import { showToast } from "./utils/toast";
import WeekNavigationHeader from "./components/WeekNavigationHeader";
import Combobox from "./components/Combobox";
import useClients from "./hooks/useClients";
import { useSettings } from "./context/SettingsContext";
import { FileText, Receipt } from "./ui";
import { CalendarIcon } from "./components/icons/CalendarIcon";
import { CheckCircleIcon } from "./components/icons/CheckCircleIcon";
import { ClockIcon } from "./components/icons/ClockIcon";
import { CrossCircleIcon } from "./components/icons/CrossCircleIcon";
import { DocumentIcon } from "./components/icons/DocumentIcon";
import { EditIcon } from "./components/icons/EditIcon";
import { MoneyIcon } from "./components/icons/MoneyIcon";
import { ReceiptIcon } from "./components/icons/ReceiptIcon";
import { TrashIcon } from "./components/icons/TrashIcon";
import { PlusCircleIcon } from "./components/icons/PlusCircleIcon";
import { consumeInvoiceSeed } from "./utils/invoiceSeedStorage";
import { isPriorityToggleDisabled } from "./utils/priorityFlags";

const api = async ({ url, data, body, headers, ...options }) => {
  const init = { ...options };
  if (data !== undefined && body === undefined) {
    init.body = JSON.stringify(data);
  } else if (body !== undefined) {
    init.body = body;
  }

  if (data !== undefined && body === undefined) {
    init.headers = {
      "Content-Type": "application/json",
      ...(headers || {}),
    };
  } else if (headers) {
    init.headers = headers;
  }

  const payload = await apiFetch(url, init);
  return { data: payload };
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "red" }}>
          Une erreur est survenue.
        </div>
      );
    }
    return this.props.children;
  }
}

// Utility functions
const formatDate = (date) => {
  return new Date(date).toLocaleDateString("fr-FR");
};

const getWeekNumber = (date) => {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

const extractArrayData = (response, key) => {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (key && Array.isArray(response?.[key])) return response[key];
  if (key && response?.data && Array.isArray(response.data[key])) {
    return response.data[key];
  }
  return [];
};

const CACHE_STORAGE_KEYS = {
  quotes: "fleemy.quotesCache",
  invoices: "fleemy.invoicesCache",
};

const readCacheFromStorage = (key, ttl) => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue);
    if (!parsed?.timestamp || !parsed?.data) {
      return null;
    }
    if (ttl && Date.now() - parsed.timestamp > ttl) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error(`Failed to read cache for ${key}`, error);
    return null;
  }
};

const persistCacheToStorage = (key, data) => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const payload = { timestamp: Date.now(), data };
    window.localStorage.setItem(key, JSON.stringify(payload));
    return payload.timestamp;
  } catch (error) {
    console.error(`Failed to persist cache for ${key}`, error);
    return null;
  }
};

const normalizeId = (value) =>
  value !== undefined && value !== null ? String(value) : "";

// Ensure time strings are always HH:MM with leading zeroes
const normalizeTime = (time) => {
  if (!time) return "00:00";
  if (time.includes("T")) {
    const d = new Date(time);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
  const [h = "00", m = "00"] = time.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
};

const getCurrentWeek = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff =
    now -
    start +
    (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000;
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.ceil((day + start.getDay() + 1) / 7);
};

// Authentication Screen
import { getAuth } from "firebase/auth";
import {
  auth,
  signInWithGoogle,
  getGoogleRedirectResult,
  GOOGLE_SIGN_IN_STATUS,
} from "./firebase";

const AuthScreen = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(() => {
    let mounted = true;

    getGoogleRedirectResult()
      .then((result) => {
        if (!mounted || !result?.user) {
          return;
        }
        setStatusMessage(null);
        onLogin(result.user);
      })
      .catch((redirectError) => {
        console.error("Firebase redirect auth error", redirectError);
        if (mounted) {
          setError("Erreur de connexion.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [onLogin]);

  const handleLogin = async () => {
    try {
      setError(null);
      setStatusMessage(null);
      setLoading(true);
      const result = await signInWithGoogle();
      const statusFromResult = result?.status;

      if (result?.user) {
        onLogin(result.user);
        return;
      }

      if (statusFromResult === GOOGLE_SIGN_IN_STATUS.REDIRECT_TRIGGERED) {
        setStatusMessage(
          "Redirection vers Google en cours… Finalisez la connexion sur la fenêtre ouverte."
        );
        return;
      }

      if (statusFromResult === GOOGLE_SIGN_IN_STATUS.RECOVERABLE_ERROR) {
        setError(
          "Google n'a pas pu s'ouvrir automatiquement. Autorisez les popups et cookies tiers, puis réessayez."
        );
        return;
      }

      setError("Erreur de connexion.");
    } catch (e) {
      console.error("Firebase auth error", e);
      setStatusMessage(null);
      setError("Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md w-full mx-4">
        <div className="text-6xl mb-6">📊</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Fleemy</h1>
        <p className="text-gray-600 mb-8">
          Votre outil tout-en-un pour indépendants
        </p>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        {!error && statusMessage && (
          <p className="text-blue-600 mb-4">{statusMessage}</p>
        )}
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
          disabled={loading}
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </div>
    </div>
  );
};

// Sidebar Navigation
const Sidebar = ({
  currentPage,
  setCurrentPage,
  user,
  onLogout,
  isMobile,
  setIsMobileMenuOpen,
}) => {
  const menuItems = [
    { id: "dashboard", name: "Dashboard", icon: "📊" },
    { id: "planning", name: "Planning", icon: "📅" },
    { id: "todos", name: "To-do List", icon: "📝" },
    { id: "clients", name: "Clients", icon: "👥" },
    { id: "quotes", name: "Devis", icon: "📋" },
    { id: "invoices", name: "Factures", icon: "🧾" },
    { id: "settings", name: "Paramètres", icon: "⚙️" },
  ];

  const handleMenuClick = (pageId) => {
    setCurrentPage(pageId);
    if (isMobile) {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <div className="h-full bg-white shadow-lg border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">📊</div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Fleemy</h1>
            <p className="text-xs text-gray-500">Outil tout-en-un</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleMenuClick(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                  currentPage === item.id
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            {user?.name ? user.name.charAt(0).toUpperCase() : ""}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">
              {user?.name ?? ""}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user?.email ?? ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.location.href = "/profiles";
            }}
            className="flex-1 text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 transition"
          >
            Changer d'équipes
          </button>
          <button
            onClick={onLogout}
            className="flex-1 text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 transition"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
};

// Dashboard Component
const Dashboard = ({ user }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiCall = async (url, options = {}) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    if (!user) {
      console.error("[apiCall] utilisateur non connecté"); // ✅ CHECKED auth
      try {
        return await api({ url, ...options });
      } catch (err) {
        console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
        throw err;
      }
    }

    let token;
    try {
      token = await user.getIdToken(); // ✅ FIXED token/projectId/trace
    } catch (err) {
      console.error("[apiCall] impossible d'obtenir le token:", err); // ✅ FIXED token/projectId/trace
      throw err;
    }
    try {
      return await api({
        url,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(user?.uid ? { "X-User-Id": user.uid } : {}),
          ...options.headers,
        },
        ...options,
      });
    } catch (err) {
      console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
      throw err;
    }
  };

  const loadDashboard = async () => {
    try {
      const response = await apiCall("/dashboard");
      setDashboardData(response.data);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats || {};

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-2xl">
        <h1 className="text-2xl font-bold mb-2">
          Bonjour, {user?.name ?? ""} ! 👋
        </h1>
        <p className="text-blue-100">Voici un aperçu de votre activité</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Revenus du mois</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.monthly_revenue || 0)}
              </p>
            </div>
            <div className="text-3xl">💰</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total clients</p>
              <p className="text-2xl font-bold text-blue-600">
                {stats.total_clients || 0}
              </p>
            </div>
            <div className="text-3xl">👥</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tâches en cours</p>
              <p className="text-2xl font-bold text-orange-600">
                {stats.pending_todos_count || 0}
              </p>
            </div>
            <div className="text-3xl">📝</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Factures impayées</p>
              <p className="text-2xl font-bold text-red-600">
                {stats.unpaid_invoices_count || 0}
              </p>
            </div>
            <div className="text-3xl">🧾</div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prochains événements */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">📅</span>
            Prochains événements
          </h2>
          <div className="space-y-3">
            {dashboardData?.upcoming_events?.length > 0 ? (
              dashboardData.upcoming_events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800">
                      {event.description}
                    </p>
                    <p className="text-sm text-gray-600">
                      {event?.client_name ?? ""}
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {event.day} {event.start_time}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                Aucun événement à venir
              </p>
            )}
          </div>
        </div>

        {/* Tâches en attente */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">✅</span>
            Tâches en attente
          </h2>
          <div className="space-y-3">
            {dashboardData?.pending_todos?.length > 0 ? (
              dashboardData.pending_todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800">{todo.title}</p>
                    {todo.description && (
                      <p className="text-sm text-gray-600">
                        {todo.description}
                      </p>
                    )}
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      todo.priority === "urgent"
                        ? "bg-red-100 text-red-700"
                        : todo.priority === "normal"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {todo.priority === "urgent"
                      ? "Urgent"
                      : todo.priority === "normal"
                        ? "Normal"
                        : "Faible"}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                Aucune tâche en attente
              </p>
            )}
          </div>
        </div>

        {/* Clients récents */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">👥</span>
            Clients récents
          </h2>
          <div className="space-y-3">
            {dashboardData?.recent_clients?.length > 0 ? (
              dashboardData.recent_clients.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800">
                      {client?.name ?? ""}
                    </p>
                    {client?.company && (
                      <p className="text-sm text-gray-600">{client.company}</p>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(client.created_at)}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                Aucun client récent
              </p>
            )}
          </div>
        </div>

        {/* Devis en cours */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">📋</span>
            Devis en cours
          </h2>
          <div className="space-y-3">
            {dashboardData?.pending_quotes?.length > 0 ? (
              dashboardData.pending_quotes.map((quote) => (
                <div
                  key={quote.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800">{quote.title}</p>
                    <p className="text-sm text-gray-600">
                      {quote?.client_name ?? ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">
                      {formatCurrency(quote.total)}
                    </p>
                    <div
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        quote.status === "sent"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {quote.status === "sent" ? "Envoyé" : "Brouillon"}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                Aucun devis en cours
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Planning Constants
const dayNames = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
const englishDayNames = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const TASK_STATUS_LABELS = {
  todo: "À faire",
  doing: "En cours",
  done: "Terminée",
};

const TASK_PRIORITY_LABELS = {
  high: "Haute",
  medium: "Normale",
  low: "Basse",
};

const normalizeTaskStatusValue = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "todo" || normalized === "doing" || normalized === "done") {
    return normalized;
  }
  return undefined;
};

const normalizeTaskPriorityValue = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "low") {
    return normalized;
  }
  return "medium";
};

const normalizeTaskPriceValue = (value) => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const normalizeLinkedTask = (task, index = 0) => {
  if (!task || typeof task !== "object") {
    return null;
  }

  const labelFromTask =
    typeof task.label === "string" && task.label.trim().length > 0
      ? task.label.trim()
      : null;
  const labelFromName =
    typeof task.name === "string" && task.name.trim().length > 0
      ? task.name.trim()
      : null;
  const label = labelFromTask || labelFromName || `Tâche ${index + 1}`;

  const idCandidates = [task.taskId, task.id, task.occurrenceId];
  const resolvedId = idCandidates.find((candidate) => {
    if (typeof candidate === "number") {
      return true;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return true;
    }
    return false;
  });
  const normalizedId =
    typeof resolvedId === "number"
      ? resolvedId.toString()
      : typeof resolvedId === "string"
        ? resolvedId.trim()
        : `task-${index}`;

  const iconCandidate =
    typeof task.icon === "string" && task.icon.trim()
      ? task.icon.trim()
      : typeof task.iconId === "string" && task.iconId.trim()
        ? task.iconId.trim()
        : undefined;

  const priorityEnabled =
    isPriorityToggleDisabled(task.priorityEnabled) ||
    isPriorityToggleDisabled(task.priority_enabled)
      ? false
      : true;
  const statusEnabled =
    task.statusEnabled === false || task.status_enabled === false
      ? false
      : true;

  return {
    id: normalizedId,
    label,
    price: normalizeTaskPriceValue(task.price),
    status: normalizeTaskStatusValue(task.status),
    priority: normalizeTaskPriorityValue(task.priority),
    priorityEnabled,
    statusEnabled,
    done:
      task.done === true ||
      (typeof task.status === "string" && task.status.trim().toLowerCase() === "done"),
    icon: iconCandidate,
    color:
      typeof task.color === "string" && task.color.trim().length > 0
        ? task.color.trim()
        : undefined,
  };
};

const toDateValue = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const formatTimeFromDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
};

const extractTimeValue = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return formatTimeFromDate(value);
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : formatTimeFromDate(parsed);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      const [hours, minutes] = trimmed.split(":");
      return `${hours.padStart(2, "0")}:${minutes}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatTimeFromDate(parsed);
    }
    const match = trimmed.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return `${match[1].padStart(2, "0")}:${match[2]}`;
    }
    return null;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : formatTimeFromDate(parsed);
  }
  return null;
};

const resolveEventDayIndex = (event, startDate) => {
  if (startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
    return (startDate.getDay() + 6) % 7;
  }
  const rawDay = event?.day;
  if (typeof rawDay === "number" && Number.isFinite(rawDay)) {
    const rounded = Math.round(rawDay);
    return Math.max(0, Math.min(6, rounded));
  }
  if (typeof rawDay === "string") {
    const normalized = rawDay.trim().toLowerCase();
    const frenchIndex = dayNames.findIndex(
      (day) => day.toLowerCase() === normalized,
    );
    if (frenchIndex !== -1) {
      return frenchIndex;
    }
    const englishIndex = englishDayNames.indexOf(normalized);
    if (englishIndex !== -1) {
      return englishIndex;
    }
  }
  return 0;
};
const dayNamesShort = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const monthNames = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const timeSlots = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const DETAILED_MODE_MIN_STEP = 15;

const parseTimeStringSafe = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }
  if (hours === 24) {
    return minutes === 0 ? MINUTES_PER_DAY : null;
  }
  if (hours < 0 || hours > 23) {
    return null;
  }
  return hours * MINUTES_PER_HOUR + minutes;
};

const minutesToTimeString = (totalMinutes) => {
  const clamped = Math.max(0, Math.min(totalMinutes, MINUTES_PER_DAY));
  if (clamped === MINUTES_PER_DAY) {
    return "24:00";
  }
  const hours = Math.floor(clamped / MINUTES_PER_HOUR);
  const minutes = clamped % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const roundTimeForHourMode = (value, direction, { allowEndOfDay = false } = {}) => {
  const minutes = parseTimeStringSafe(value);
  if (minutes == null) {
    return null;
  }

  if (direction === "ceil") {
    if (minutes % MINUTES_PER_HOUR === 0) {
      const capped = allowEndOfDay
        ? Math.min(minutes, MINUTES_PER_DAY)
        : Math.min(minutes, MINUTES_PER_DAY - MINUTES_PER_HOUR);
      return minutesToTimeString(capped);
    }
    let ceiled = minutes + (MINUTES_PER_HOUR - (minutes % MINUTES_PER_HOUR));
    if (!allowEndOfDay && ceiled >= MINUTES_PER_DAY) {
      ceiled = MINUTES_PER_DAY - MINUTES_PER_HOUR;
    }
    ceiled = Math.min(ceiled, MINUTES_PER_DAY);
    return minutesToTimeString(ceiled);
  }

  let floored = minutes - (minutes % MINUTES_PER_HOUR);
  if (!allowEndOfDay && floored >= MINUTES_PER_DAY) {
    floored = MINUTES_PER_DAY - MINUTES_PER_HOUR;
  }
  floored = Math.max(0, Math.min(floored, MINUTES_PER_DAY));
  return minutesToTimeString(floored);
};

const sanitizeRangeForHourMode = (start, end) => {
  const roundedStart = roundTimeForHourMode(start, "floor") ?? "09:00";
  let roundedEnd = roundTimeForHourMode(end, "ceil", { allowEndOfDay: true }) ?? "10:00";

  const startMinutes = parseTimeStringSafe(roundedStart);
  let endMinutes = parseTimeStringSafe(roundedEnd);

  if (startMinutes != null) {
    if (endMinutes == null || endMinutes <= startMinutes) {
      endMinutes = Math.min(startMinutes + MINUTES_PER_HOUR, MINUTES_PER_DAY);
      if (endMinutes <= startMinutes) {
        endMinutes = Math.min(startMinutes + MINUTES_PER_HOUR, MINUTES_PER_DAY);
      }
      roundedEnd = minutesToTimeString(endMinutes);
    }
  }

  return { start: roundedStart, end: roundedEnd };
};

const sanitizeRangeForDetailedMode = (start, end) => {
  let normalizedStart = start;
  let normalizedEnd = end;

  let startMinutes = parseTimeStringSafe(normalizedStart);
  if (startMinutes == null) {
    normalizedStart = "09:00";
    startMinutes = parseTimeStringSafe(normalizedStart) ?? 9 * MINUTES_PER_HOUR;
  }

  let endMinutes = parseTimeStringSafe(normalizedEnd);
  if (endMinutes == null || endMinutes <= startMinutes) {
    let candidate = Math.min(startMinutes + DETAILED_MODE_MIN_STEP, MINUTES_PER_DAY);
    if (candidate <= startMinutes) {
      candidate = Math.min(startMinutes + MINUTES_PER_HOUR, MINUTES_PER_DAY);
    }
    if (candidate <= startMinutes) {
      candidate = Math.min(startMinutes + 1, MINUTES_PER_DAY);
    }
    normalizedEnd = minutesToTimeString(candidate);
  }

  return { start: normalizedStart, end: normalizedEnd };
};

const eventTypes = {
  paid: {
    label: "Payé",
    color: "bg-green-200 text-gray-800 border-gray-200",
    bgColor: "#bbf7d0",
  },
  unpaid: {
    label: "Impayé",
    color: "bg-red-200 text-gray-800 border-gray-200",
    bgColor: "#fecaca",
  },
  pending: {
    label: "En attente",
    color: "bg-orange-200 text-gray-800 border-gray-200",
    bgColor: "#fed7aa",
  },
  not_worked: {
    label: "Pas travaillé",
    color: "bg-purple-100 border-purple-300 text-purple-800",
    bgColor: "#e9d5ff",
  },
};

const EVENT_KIND_OPTIONS = [
  { value: "normal", label: "Travail / Intervention" },
  { value: "absence", label: "Absence / Indisponible" },
];

const normalizeStringValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
};

const PAYMENT_STATUS_VALUES = ["paid", "unpaid", "pending", "not_worked"];

const resolvePaymentStatus = (event) => {
  const candidates = [
    event?.payment_status,
    event?.paymentStatus,
    event?.status,
    event?.state,
    event?.type,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStringValue(candidate);
    if (PAYMENT_STATUS_VALUES.includes(normalized)) {
      return normalized;
    }
  }

  return "pending";
};

const resolveEventKind = (event) => {
  const rawCandidates = [
    event?.type,
    event?.event_type,
    event?.eventType,
    event?.category,
  ];

  for (const candidate of rawCandidates) {
    const normalized = normalizeStringValue(candidate);
    if (normalized === "absence") {
      return "absence";
    }
    if (normalized === "normal" || normalized === "work") {
      return "normal";
    }
  }

  return "normal";
};

// Utility functions for planning
const getWeekDates = (year, week) => {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

  const days = [];
  for (let i = 0; i < 5; i++) {
    // Lundi à Vendredi
    const day = new Date(ISOweekStart);
    day.setDate(ISOweekStart.getDate() + i);
    days.push(day);
  }
  return days;
};

const getMonthDays = (year, month) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  // Adjust so Monday = 0
  const offsetStart = (firstDay + 6) % 7;

  const days = [];

  // Fill leading empty cells
  for (let i = 0; i < offsetStart; i++) {
    days.push(null);
  }

  // Days of current month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({
      date: new Date(year, month, i),
      isCurrentMonth: true,
    });
  }

  // Fill trailing empty cells so total is multiple of 7
  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
};

// Event Modal Component
const EventModal = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  event,
  timeSlot,
  selectedDate,
  readOnly,
  navigate,
  onSwitchToTask,
  copiedItem,
  onCopy,
  attachedTasks = [],
  onEditLinkedTask,
  initialLinkedTaskId = null,
}) => {
  const [formData, setFormData] = useState({
    description: "",
    day: 0,
    start: "09:00",
    end: "10:00",
    type: "normal",
    payment_status: "pending",
    client_id: "",
    client_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState("");
  const clientFieldId = useId();
  const eventTypeFieldId = useId();
  const clientErrorId = `${clientFieldId}-error`;

  const { settings } = useSettings();
  const allowMinutes = settings?.enableMinutes === true;
  const mustHaveClient = settings?.requireClientName === true;
  const timeInputStep = allowMinutes ? 900 : 3600;

  const hasClientSelection =
    formData.type === "absence" ||
    Boolean(formData.client_id || formData.client_name?.trim());
  const isAbsenceEvent = formData.type === "absence";
  const normalizedClientIdForDocs = normalizeId(formData.client_id).trim();
  const canNavigateToDocuments =
    typeof navigate === "function" &&
    !isAbsenceEvent &&
    normalizedClientIdForDocs.length > 0;
  const isDocumentsShortcutDisabled = !canNavigateToDocuments;

  // Use clients hook for client selection
  const {
    clients,
    loading: clientsLoading,
    loadClients,
  } = useClients({ search: '', page: 1, limit: 100 });

  useEffect(() => {
    if (isOpen) {
      loadClients();
    }
  }, [isOpen, loadClients]);

  useEffect(() => {
    if (!isOpen) {
      setClientError("");
      return;
    }

    if (event) {
      const startDate = toDateValue(event.start ?? event.start_time);
      const endDate = toDateValue(event.end ?? event.end_time);

      const rawStart =
        extractTimeValue(event.start) ??
        extractTimeValue(event.start_time) ??
        formatTimeFromDate(startDate);
      const rawEnd =
        extractTimeValue(event.end) ??
        extractTimeValue(event.end_time) ??
        formatTimeFromDate(endDate);

      const fallbackRange = sanitizeRangeForDetailedMode(
        rawStart || "09:00",
        rawEnd || "10:00",
      );

      let resolvedStart = rawStart ?? fallbackRange.start;
      let resolvedEnd = rawEnd ?? fallbackRange.end;

      if (!allowMinutes) {
        if (parseTimeStringSafe(resolvedStart) == null) {
          resolvedStart = fallbackRange.start;
        }
        if (parseTimeStringSafe(resolvedEnd) == null) {
          resolvedEnd = fallbackRange.end;
        }
      }

      const dayIndex = resolveEventDayIndex(event, startDate);

      const resolvedType = resolveEventKind(event);
      const resolvedStatus = resolvePaymentStatus(event);
      const resolvedClientName = (() => {
        if (resolvedType === "absence") {
          return "";
        }
        if (typeof event.client_name === "string" && event.client_name.trim()) {
          return event.client_name;
        }
        if (typeof event.client === "string" && event.client.trim()) {
          return event.client;
        }
        if (event.client && typeof event.client === "object") {
          return (
            event.client.display_name ||
            event.client.name ||
            event.client.label ||
            ""
          );
        }
        return "";
      })();

      setFormData({
        description: event.description || "",
        day: dayIndex,
        start: resolvedStart,
        end: resolvedEnd,
        type: resolvedType,
        payment_status: resolvedStatus,
        client_id: resolvedType === "absence" ? "" : event.client_id || "",
        client_name: resolvedType === "absence" ? "" : resolvedClientName,
      });
      setClientError("");
      return;
    }

    if (timeSlot) {
      const baseRange = { start: timeSlot.start, end: timeSlot.end };
      const resolvedRange = allowMinutes
        ? sanitizeRangeForDetailedMode(baseRange.start, baseRange.end)
        : sanitizeRangeForHourMode(baseRange.start, baseRange.end);

      setFormData({
        description: "",
        day: timeSlot.day,
        start: resolvedRange.start,
        end: resolvedRange.end,
        type: "normal",
        payment_status: "pending",
        client_id: "",
        client_name: "",
      });
      setClientError("");
      return;
    }

    if (selectedDate) {
      const dayIndex = (selectedDate.getDay() + 6) % 7;
      const formatTime = (date) =>
        `${String(date.getHours()).padStart(2, "0")}:${String(
          date.getMinutes(),
        ).padStart(2, "0")}`;
      const selectedTime = formatTime(selectedDate);

      let startSlot = timeSlots[0];
      let endSlot = timeSlots[1] || timeSlots[0];

      if (allowMinutes) {
        const startMinutes = parseTimeStringSafe(selectedTime) ?? 9 * MINUTES_PER_HOUR;
        const endMinutes = Math.min(startMinutes + MINUTES_PER_HOUR, MINUTES_PER_DAY);
        startSlot = minutesToTimeString(startMinutes);
        endSlot = minutesToTimeString(endMinutes);
      } else {
        const timeToMinutes = (time) => {
          const [hoursValue, minutesValue] = time.split(":").map(Number);
          return hoursValue * 60 + minutesValue;
        };

        let startIndex = timeSlots.indexOf(selectedTime);

        if (startIndex === -1) {
          const selectedMinutes = timeToMinutes(selectedTime);
          startIndex = timeSlots.findIndex(
            (slot) => timeToMinutes(slot) >= selectedMinutes,
          );
        }

        if (startIndex === -1) {
          startIndex = Math.max(timeSlots.length - 2, 0);
        }

        if (startIndex === timeSlots.length - 1 && timeSlots.length > 1) {
          startIndex -= 1;
        }

        startSlot = timeSlots[startIndex] || timeSlots[0];
        endSlot =
          startIndex < timeSlots.length - 1
            ? timeSlots[startIndex + 1]
            : timeSlots[startIndex];
      }

      const resolvedRange = allowMinutes
        ? sanitizeRangeForDetailedMode(startSlot, endSlot)
        : sanitizeRangeForHourMode(startSlot, endSlot);

      setFormData({
        description: "",
        day: dayIndex,
        start: resolvedRange.start,
        end: resolvedRange.end,
        type: "normal",
        payment_status: "pending",
        client_id: "",
        client_name: "",
      });
      setClientError("");
      return;
    }

    const defaultRange = allowMinutes
      ? sanitizeRangeForDetailedMode("09:00", "10:00")
      : sanitizeRangeForHourMode("09:00", "10:00");

    setFormData({
      description: "",
      day: 0,
      start: defaultRange.start,
      end: defaultRange.end,
      type: "normal",
      payment_status: "pending",
      client_id: "",
      client_name: "",
    });
    setClientError("");
  }, [event, timeSlot, selectedDate, isOpen, allowMinutes]);

  useEffect(() => {
    if (!mustHaveClient) {
      setClientError("");
    }
  }, [mustHaveClient]);

  useEffect(() => {
    if (mustHaveClient && hasClientSelection) {
      setClientError("");
    }
  }, [mustHaveClient, hasClientSelection]);

  const handleNavigateToDocuments = (targetTab) => {
    if (isDocumentsShortcutDisabled) {
      return;
    }

    if (typeof navigate !== "function") {
      return;
    }

    const params = new URLSearchParams();
    params.set("tab", targetTab);
    if (normalizedClientIdForDocs) {
      params.set("client", normalizedClientIdForDocs);
    }
    params.set("create", "true");

    if (typeof onClose === "function") {
      onClose();
    }

    navigate(`/documents?${params.toString()}`);
  };

  const documentsShortcutBaseClasses =
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900";
  const documentsShortcutEnabledClasses =
    "bg-blue-500 text-white shadow-sm hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400";
  const documentsShortcutDisabledClasses =
    "cursor-not-allowed bg-slate-200 text-slate-500 opacity-70 dark:bg-slate-800 dark:text-slate-500";
  const shouldShowDocumentsHint =
    !isAbsenceEvent && normalizedClientIdForDocs.length === 0;

  const normalizedLinkedTasks = useMemo(() => {
    const directTasks = Array.isArray(attachedTasks) ? attachedTasks : [];
    if (directTasks.length > 0) {
      return directTasks
        .map((task, index) => normalizeLinkedTask(task, index))
        .filter(Boolean);
    }
    if (event && Array.isArray(event.attachedTaskBadges)) {
      return event.attachedTaskBadges
        .map((task, index) => normalizeLinkedTask(task, index))
        .filter(Boolean);
    }
    return [];
  }, [attachedTasks, event]);

  const hasLinkedTasks = normalizedLinkedTasks.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.type !== "absence" && mustHaveClient && !hasClientSelection) {
      setClientError(
        "Un client est obligatoire pour enregistrer cet événement.",
      );
      return;
    }

    setLoading(true);
    try {
      const range = allowMinutes
        ? sanitizeRangeForDetailedMode(formData.start, formData.end)
        : sanitizeRangeForHourMode(formData.start, formData.end);

      const normalizedType = formData.type === "absence" ? "absence" : "normal";
      const paymentStatus =
        normalizedType === "absence"
          ? "not_worked"
          : formData.payment_status || "pending";

      const payload = {
        ...formData,
        type: normalizedType,
        payment_status: paymentStatus,
        status: paymentStatus,
        client_id: normalizedType === "absence" ? "" : formData.client_id,
        client_name: normalizedType === "absence" ? "" : formData.client_name,
        start: range.start,
        end: range.end,
      };

      setFormData((current) => {
        if (current.start === range.start && current.end === range.end) {
          if (
            current.type === normalizedType &&
            current.payment_status === paymentStatus &&
            (normalizedType === "absence"
              ? !current.client_id && !current.client_name
              : current.client_id === payload.client_id &&
                current.client_name === payload.client_name)
          ) {
            return current;
          }
        }
        return {
          ...current,
          start: range.start,
          end: range.end,
          type: normalizedType,
          payment_status: paymentStatus,
          client_id: payload.client_id,
          client_name: payload.client_name,
        };
      });

      await onSave(payload);
    } catch (error) {
      console.error("Error saving event:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet événement ?")) {
      setLoading(true);
      try {
        await onDelete(event.id);
      } catch (error) {
        console.error("Error deleting event:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSwitchToTask = useCallback(() => {
    if (typeof onSwitchToTask !== "function") {
      return;
    }

    if (event || readOnly) {
      return;
    }

    const range = allowMinutes
      ? sanitizeRangeForDetailedMode(formData.start, formData.end)
      : sanitizeRangeForHourMode(formData.start, formData.end);

    onSwitchToTask({
      timeSlot: {
        day: formData.day,
        start: range.start,
        end: range.end,
      },
    });
  }, [allowMinutes, event, formData.day, formData.end, formData.start, onSwitchToTask, readOnly]);

  const handleCopy = useCallback(() => {
    if (typeof onCopy !== "function") {
      return;
    }

    const range = allowMinutes
      ? sanitizeRangeForDetailedMode(formData.start, formData.end)
      : sanitizeRangeForHourMode(formData.start, formData.end);

    onCopy({
      type: "event",
      payload: {
        ...formData,
        start: range.start,
        end: range.end,
      },
    });
  }, [allowMinutes, formData, onCopy]);

  const handlePaste = useCallback(() => {
    if (!copiedItem || copiedItem.type !== "event") {
      return;
    }

    const source = copiedItem.payload || {};
    const range = allowMinutes
      ? sanitizeRangeForDetailedMode(source.start || formData.start, source.end || formData.end)
      : sanitizeRangeForHourMode(source.start || formData.start, source.end || formData.end);

    setFormData((current) => ({
      ...current,
      description: source.description || "",
      day: typeof source.day === "number" ? source.day : current.day,
      start: range.start,
      end: range.end,
      type: source.type || "normal",
      payment_status: source.payment_status || "pending",
      client_id: source.client_id || "",
      client_name: source.client_name || "",
    }));
  }, [allowMinutes, copiedItem, formData.end, formData.start]);

  const shouldShowTaskTab =
    typeof onSwitchToTask === "function" && !event && !readOnly;
  const canEditLinkedTasks =
    typeof onEditLinkedTask === "function" && !readOnly && hasLinkedTasks;
  const shouldDisplayModalTabs = shouldShowTaskTab || canEditLinkedTasks;
  const taskTabLabel = canEditLinkedTasks
    ? `Tâches (${normalizedLinkedTasks.length})`
    : "Tâches";
  const preferredLinkedTaskId = useMemo(() => {
    if (!hasLinkedTasks) {
      return null;
    }
    const normalizedTarget =
      initialLinkedTaskId == null
        ? ""
        : String(initialLinkedTaskId).trim();
    if (normalizedTarget) {
      const matchingTask = normalizedLinkedTasks.find((task) => {
        if (!task?.id) {
          return false;
        }
        return String(task.id).trim() === normalizedTarget;
      });
      if (matchingTask?.id) {
        return matchingTask.id;
      }
    }
    return normalizedLinkedTasks[0]?.id || null;
  }, [hasLinkedTasks, initialLinkedTaskId, normalizedLinkedTasks]);

  const handleEditLinkedTasksClick = useCallback(() => {
    if (!canEditLinkedTasks || !normalizedLinkedTasks.length) {
      return;
    }
    const targetTaskId = preferredLinkedTaskId || normalizedLinkedTasks[0]?.id;
    if (typeof onEditLinkedTask === "function") {
      onEditLinkedTask(targetTaskId);
    }
  }, [canEditLinkedTasks, normalizedLinkedTasks, onEditLinkedTask, preferredLinkedTaskId]);

  const handleTaskTabClick = useCallback(() => {
    if (canEditLinkedTasks) {
      handleEditLinkedTasksClick();
      return;
    }

    if (shouldShowTaskTab) {
      handleSwitchToTask();
    }
  }, [canEditLinkedTasks, handleEditLinkedTasksClick, handleSwitchToTask, shouldShowTaskTab]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content dark:bg-slate-900 dark:text-slate-100">
        <div className="modal-header dark:text-slate-100 dark:border-slate-700 flex items-center justify-between gap-4">
          <span>{event ? "Modifier l'événement" : "Nouvel événement"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={handleCopy}
              title="Copier l'événement"
              disabled={loading}
              aria-label="Copier l'événement"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-4 w-4"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={handlePaste}
              title="Coller l'événement copié"
              aria-label="Coller l'événement copié"
              disabled={loading || !copiedItem || copiedItem.type !== "event"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-4 w-4"
              >
                <path d="M8 7h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                <path d="M16 3h-1a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2H8a2 2 0 0 0-2 2v1h12V5a2 2 0 0 0-2-2Z" />
              </svg>
            </button>
          </div>
        </div>

        {shouldDisplayModalTabs && (
          <div
            className="modal-tab-group"
            role="group"
            aria-label="Navigation événement et tâches"
          >
            <button
              type="button"
              className="modal-tab is-active"
              aria-current="page"
            >
              Événement
            </button>
            <button
              type="button"
              className="modal-tab"
              onClick={handleTaskTabClick}
            >
              {taskTabLabel}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <fieldset disabled={readOnly}>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="form-input"
                disabled={loading}
                placeholder="Description de l'événement (optionnel)"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Jour</label>
              <select
                value={formData.day}
                onChange={(e) =>
                  setFormData({ ...formData, day: parseInt(e.target.value, 10) })
                }
                className="form-input"
                disabled={loading}
              >
                {dayNames.map((day, index) => (
                  <option key={index} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Heure de début</label>
                {allowMinutes ? (
                  <input
                    type="time"
                    step={timeInputStep}
                    value={formData.start}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, start: e.target.value }))
                    }
                    className="form-input"
                    disabled={loading}
                    required
                  />
                ) : (
                  <select
                    value={formData.start}
                    onChange={(e) =>
                      setFormData({ ...formData, start: e.target.value })
                    }
                    className="form-input"
                    disabled={loading}
                  >
                    {!timeSlots.includes(formData.start) && formData.start && (
                      <option value={formData.start}>{formData.start}</option>
                    )}
                    {timeSlots.slice(0, -1).map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Heure de fin</label>
                {allowMinutes ? (
                  <input
                    type="time"
                    step={timeInputStep}
                    value={formData.end === "24:00" ? "23:59" : formData.end}
                    onChange={(e) =>
                      setFormData((prev) => {
                        const rawValue = e.target.value;
                        const nextEnd =
                          rawValue === "23:59" && prev.end === "24:00"
                            ? "24:00"
                            : rawValue;
                        return { ...prev, end: nextEnd };
                      })
                    }
                    className="form-input"
                    disabled={loading}
                    required
                  />
                ) : (
                  <select
                    value={formData.end}
                    onChange={(e) =>
                      setFormData({ ...formData, end: e.target.value })
                    }
                    className="form-input"
                    disabled={loading}
                  >
                    {!timeSlots.includes(formData.end) && formData.end && (
                      <option value={formData.end}>{formData.end}</option>
                    )}
                    {timeSlots.slice(1).map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor={eventTypeFieldId}>
                Type d'événement
              </label>
              <select
                id={eventTypeFieldId}
                value={formData.type}
                onChange={(e) => {
                  const nextType = e.target.value === "absence" ? "absence" : "normal";
                  setFormData((prev) => ({
                    ...prev,
                    type: nextType,
                    payment_status:
                      nextType === "absence"
                        ? "not_worked"
                        : prev.payment_status && prev.payment_status !== "not_worked"
                          ? prev.payment_status
                          : "pending",
                    client_id: nextType === "absence" ? "" : prev.client_id,
                    client_name: nextType === "absence" ? "" : prev.client_name,
                  }));
                  if (nextType === "absence") {
                    setClientError("");
                  }
                }}
                className="form-input"
                disabled={loading}
              >
                {EVENT_KIND_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor={clientFieldId}>
                <span>Client</span>
                {mustHaveClient && !isAbsenceEvent && (
                  <span
                    className="ml-1 text-red-600 dark:text-red-400"
                    aria-hidden="true"
                  >
                    *
                  </span>
                )}
              </label>
              <Combobox
                id={clientFieldId}
                options={clients || []}
                value={isAbsenceEvent ? "" : formData.client_id}
                onChange={(clientId, selectedOption) => {
                  if (isAbsenceEvent) {
                    return;
                  }
                  const clientFromList =
                    selectedOption || clients?.find((c) => c.id === clientId);
                  const resolvedClientName =
                    clientFromList?.display_name || clientFromList?.name || "";
                  setFormData((prev) => ({
                    ...prev,
                    client_id: clientId,
                    client_name: resolvedClientName,
                  }));
                  setClientError("");
                }}
                displayField="display_name"
                valueField="id"
                placeholder={
                  isAbsenceEvent
                    ? "Client non requis pour une absence"
                    : mustHaveClient
                      ? "Sélectionner un client (obligatoire)"
                      : "Sélectionner un client"
                }
                disabled={readOnly || loading || isAbsenceEvent}
                error={Boolean(clientError)}
                aria-invalid={
                  !isAbsenceEvent && mustHaveClient && clientError ? "true" : undefined
                }
                aria-describedby={clientError ? clientErrorId : undefined}
                aria-required={
                  isAbsenceEvent ? "false" : mustHaveClient ? "true" : "false"
                }
                aria-busy={clientsLoading ? "true" : undefined}
                className="form-input"
              />
              {clientError && !isAbsenceEvent && (
                <p
                  id={clientErrorId}
                  className="mt-1 text-xs text-red-600 dark:text-red-400"
                  aria-live="polite"
                  role="alert"
                >
                  {clientError}
                </p>
              )}
            </div>

            <div className="form-group">
              <span className="form-label">Documents</span>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleNavigateToDocuments("devis")}
                  className={`${documentsShortcutBaseClasses} ${
                    isDocumentsShortcutDisabled
                      ? documentsShortcutDisabledClasses
                      : documentsShortcutEnabledClasses
                  }`}
                  disabled={isDocumentsShortcutDisabled}
                  aria-disabled={isDocumentsShortcutDisabled ? "true" : "false"}
                  aria-label="Ouvrir les devis pour ce client"
                >
                  <FileText aria-hidden="true" className="h-5 w-5" />
                  <span>Devis</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToDocuments("factures")}
                  className={`${documentsShortcutBaseClasses} ${
                    isDocumentsShortcutDisabled
                      ? documentsShortcutDisabledClasses
                      : documentsShortcutEnabledClasses
                  }`}
                  disabled={isDocumentsShortcutDisabled}
                  aria-disabled={isDocumentsShortcutDisabled ? "true" : "false"}
                  aria-label="Ouvrir les factures pour ce client"
                >
                  <Receipt aria-hidden="true" className="h-5 w-5" />
                  <span>Factures</span>
                </button>
              </div>
              {isDocumentsShortcutDisabled && shouldShowDocumentsHint && (
                <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                  Sélectionnez un client pour accéder aux documents.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Statut de paiement</label>
              <select
                value={formData.payment_status}
                onChange={(e) =>
                  setFormData({ ...formData, payment_status: e.target.value })
                }
                className="form-input"
                disabled={readOnly || loading || isAbsenceEvent}
              >
                {Object.entries(eventTypes).map(([key, type]) => (
                  <option key={key} value={key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              disabled={loading}
            >
              {readOnly ? "Fermer" : "Annuler"}
            </button>
            {event && !readOnly && (
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-danger"
                disabled={loading}
              >
                {loading ? "..." : "Supprimer"}
              </button>
            )}
            {!readOnly && (
              <button
                type="submit"
                className={`btn btn-primary${
                  loading || (mustHaveClient && !hasClientSelection)
                    ? " opacity-60 cursor-not-allowed"
                    : ""
                }`}
                disabled={
                  loading || (mustHaveClient && !hasClientSelection)
                }
              >
                {loading ? "..." : event ? "Modifier" : "Créer"}
              </button>
            )}
            </div>
          </form>

      </div>
    </div>
  );
};

// Day Events Modal Component
const DayEventsModal = ({
  isOpen,
  onClose,
  events,
  date,
  onEventClick,
  onCreateEvent,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 className="modal-header">📅 {date && formatDate(date)}</h2>

        <div style={{ marginBottom: "24px" }}>
          {events.length > 0 ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {events.map((event) => {
                const status =
                  (typeof event.status === "string" && event.status.trim()) ||
                  (typeof event.payment_status === "string" && event.payment_status.trim()) ||
                  (typeof event.type === "string" && event.type.trim()) ||
                  "pending";
                const normalizedStatus = status.toLowerCase();
                const eventClass = `event-${
                  normalizedStatus === "paid"
                    ? "meeting"
                    : normalizedStatus === "unpaid"
                      ? "task"
                      : normalizedStatus === "pending"
                        ? "break"
                        : "notworked"
                }`;

                return (
                  <div
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className={`${eventClass}`}
                    style={{
                      padding: "12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      borderLeft: "4px solid",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div
                      className="event-description"
                      style={{ marginBottom: "4px" }}
                    >
                      {event.description}
                    </div>
                    <div className="event-time">
                      {event.start} - {event.end}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p
              style={{
                textAlign: "center",
                color: "#6c757d",
                padding: "20px 0",
              }}
            >
              Aucun événement pour cette journée
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-outline">
            Fermer
          </button>
          {onCreateEvent && (
            <button
              onClick={() => onCreateEvent(date)}
              className="btn btn-primary"
            >
              + Nouvel événement
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Task Modal Component
const TaskModal = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  task,
  initialSlot = null,
  copiedItem,
  onCopy,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    color: "#3b82f6",
    icon: "📝",
    time_slots: [],
  });

  const [timeSlotInput, setTimeSlotInput] = useState({
    day: "monday",
    start: "09:00",
    end: "10:00",
  });

  const [errors, setErrors] = useState({});

  // Available icons for tasks
  const availableIcons = [
    "📝",
    "💻",
    "📱",
    "🎨",
    "📊",
    "🔧",
    "📞",
    "📧",
    "📋",
    "💡",
    "🎯",
    "🔍",
    "📈",
    "📉",
    "💰",
    "🏆",
    "⚡",
    "🔥",
    "💎",
    "🚀",
    "📸",
    "🎬",
    "🎵",
    "📚",
    "✏️",
    "📐",
    "🖥️",
    "⌨️",
    "🖱️",
    "💾",
    "📺",
    "📻",
    "☎️",
    "📠",
    "🔔",
    "📢",
    "📯",
    "🎺",
    "🎸",
    "🎹",
    "🎤",
    "🎧",
    "📷",
    "📹",
    "💿",
    "💽",
    "💻",
    "🖨️",
    "⌚",
    "📱",
  ];

  // Available colors for tasks (pastel palette)
  const availableColors = [
    "#3b82f6",
    "#ef4444",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
    "#f97316",
    "#6366f1",
    "#14b8a6",
    "#f43f5e",
    "#8b5a2b",
    "#6b7280",
    "#64748b",
  ];

  const dayNames = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const dayLabels = [
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
    "Dimanche",
  ];

  const normalizeSlot = useCallback((slot) => {
    if (!slot) {
      return null;
    }

    const resolvedRange = sanitizeRangeForDetailedMode(
      slot.start || "09:00",
      slot.end || "10:00",
    );

    let resolvedDay = slot.day;
    if (typeof resolvedDay === "number") {
      resolvedDay = englishDayNames[resolvedDay];
    }
    if (typeof resolvedDay === "string") {
      resolvedDay = resolvedDay.toLowerCase();
    }
    if (!dayNames.includes(resolvedDay)) {
      resolvedDay = dayNames[0];
    }

    return {
      day: resolvedDay,
      start: resolvedRange.start,
      end: resolvedRange.end,
    };
  }, []);

  useEffect(() => {
    const normalizedInitialSlot = normalizeSlot(initialSlot);
    if (task) {
      const normalizedSlots = Array.isArray(task.time_slots)
        ? task.time_slots.map(normalizeSlot).filter(Boolean)
        : [];
      setFormData({
        name: task.name || "",
        price: task.price || 0,
        color: task.color || "#3b82f6",
        icon: task.icon || "📝",
        time_slots: normalizedSlots,
      });
      const firstSlot = normalizedSlots[0] || normalizedInitialSlot;
      if (firstSlot) {
        setTimeSlotInput(firstSlot);
      } else {
        setTimeSlotInput(normalizeSlot({ start: "09:00", end: "10:00" }));
      }
    } else {
      const fallbackSlot =
        normalizedInitialSlot || normalizeSlot({ start: "09:00", end: "10:00" });
      setFormData({
        name: "",
        price: 0,
        color: "#3b82f6",
        icon: "📝",
        time_slots: fallbackSlot ? [fallbackSlot] : [],
      });
      if (fallbackSlot) {
        setTimeSlotInput(fallbackSlot);
      }
    }
    setErrors({});
  }, [initialSlot, isOpen, normalizeSlot, task]);

  const handleCopy = useCallback(() => {
    if (typeof onCopy !== "function") {
      return;
    }
    onCopy({ type: "task", payload: formData });
  }, [formData, onCopy]);

  const handlePaste = useCallback(() => {
    if (!copiedItem || copiedItem.type !== "task") {
      return;
    }
    const source = copiedItem.payload || {};
    const normalizedSlots = Array.isArray(source.time_slots)
      ? source.time_slots.map(normalizeSlot).filter(Boolean)
      : [];
    setFormData({
      name: source.name || "",
      price: source.price || 0,
      color: source.color || "#3b82f6",
      icon: source.icon || "📝",
      time_slots: normalizedSlots,
    });
    if (normalizedSlots[0]) {
      setTimeSlotInput(normalizedSlots[0]);
    } else {
      setTimeSlotInput(normalizeSlot({ start: "09:00", end: "10:00" }));
    }
  }, [copiedItem, normalizeSlot]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  const addTimeSlot = () => {
    if (timeSlotInput.start >= timeSlotInput.end) {
      alert("L'heure de fin doit être après l'heure de début");
      return;
    }

    const newSlot = { ...timeSlotInput };
    setFormData((prev) => ({
      ...prev,
      time_slots: [...prev.time_slots, newSlot],
    }));

    // Reset time slot input
    setTimeSlotInput({
      day: "monday",
      start: "09:00",
      end: "10:00",
    });
  };

  const removeTimeSlot = (index) => {
    setFormData((prev) => ({
      ...prev,
      time_slots: prev.time_slots.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Le nom est obligatoire";
    }

    if (formData.price < 0) {
      newErrors.price = "Le prix doit être positif";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div
        className="modal-content dark:bg-slate-900 dark:text-slate-100"
        style={{ maxWidth: "600px" }}
      >
        <div className="modal-header dark:text-slate-100 dark:border-slate-700 flex items-center justify-between gap-4">
          <span>{task ? "✏️ Modifier la tâche" : "➕ Nouvelle tâche"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={handleCopy}
              title="Copier la tâche"
              aria-label="Copier la tâche"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-4 w-4"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={handlePaste}
              title="Coller la tâche copiée"
              aria-label="Coller la tâche copiée"
              disabled={!copiedItem || copiedItem.type !== "task"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-4 w-4"
              >
                <path d="M8 7h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
                <path d="M16 3h-1a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2H8a2 2 0 0 0-2 2v1h12V5a2 2 0 0 0-2-2Z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Nom de la tâche *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            className={`form-input ${errors.name ? "error" : ""}`}
            placeholder="Nom de la tâche"
            style={{ borderColor: errors.name ? "#dc3545" : "" }}
          />
          {errors.name && (
            <div
              style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
            >
              {errors.name}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Prix par heure (€)</label>
          <input
            type="number"
            value={formData.price}
            onChange={(e) =>
              handleInputChange("price", parseFloat(e.target.value) || 0)
            }
            className={`form-input ${errors.price ? "error" : ""}`}
            min="0"
            step="0.01"
            style={{ borderColor: errors.price ? "#dc3545" : "" }}
          />
          {errors.price && (
            <div
              style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
            >
              {errors.price}
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Couleur</label>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "8px",
              }}
            >
              {availableColors.map((color, index) => (
                <button
                  key={`${color}-${index}`}
                  type="button"
                  onClick={() => handleInputChange("color", color)}
                  style={{
                    width: "32px",
                    height: "32px",
                    backgroundColor: color,
                    border:
                      formData.color === color
                        ? "3px solid #000"
                        : "1px solid #ddd",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Icône</label>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                marginTop: "8px",
                maxHeight: "120px",
                overflowY: "auto",
              }}
            >
              {availableIcons.map((icon, index) => (
                <button
                  key={`${icon}-${index}`}
                  type="button"
                  onClick={() => handleInputChange("icon", icon)}
                  style={{
                    width: "32px",
                    height: "32px",
                    fontSize: "16px",
                    border:
                      formData.icon === icon
                        ? "2px solid #007bff"
                        : "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: "pointer",
                    backgroundColor:
                      formData.icon === icon ? "#e7f3ff" : "#fff",
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Créneaux horaires</label>

          {/* Time slot input */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "end",
              marginBottom: "12px",
            }}
          >
            <div style={{ flex: 1 }}>
              <select
                value={timeSlotInput.day}
                onChange={(e) =>
                  setTimeSlotInput((prev) => ({ ...prev, day: e.target.value }))
                }
                className="form-input"
                style={{ marginBottom: "4px" }}
              >
                {dayNames.map((day, index) => (
                  <option key={day} value={day}>
                    {dayLabels[index]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <input
                type="time"
                value={timeSlotInput.start}
                onChange={(e) =>
                  setTimeSlotInput((prev) => ({
                    ...prev,
                    start: e.target.value,
                  }))
                }
                className="form-input"
                style={{ width: "100px", marginBottom: "4px" }}
              />
            </div>
            <div style={{ margin: "0 4px", paddingBottom: "4px" }}>-</div>
            <div>
              <input
                type="time"
                value={timeSlotInput.end}
                onChange={(e) =>
                  setTimeSlotInput((prev) => ({ ...prev, end: e.target.value }))
                }
                className="form-input"
                style={{ width: "100px", marginBottom: "4px" }}
              />
            </div>
            <button
              type="button"
              onClick={addTimeSlot}
              className="btn btn-primary"
              style={{ height: "44px" }}
            >
              +
            </button>
          </div>

          {/* Time slots list */}
          {formData.time_slots.length > 0 && (
            <div
              style={{
                maxHeight: "150px",
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: "4px",
                padding: "8px",
              }}
            >
              {formData.time_slots.map((slot, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <span>
                    {dayLabels[dayNames.indexOf(slot.day)]} {slot.start} -{" "}
                    {slot.end}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeTimeSlot(index)}
                    style={{
                      color: "#dc3545",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "16px",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-outline">
            Annuler
          </button>
          {task && (
            <button
              onClick={() => onDelete(task.id)}
              className="btn btn-danger"
            >
              Supprimer
            </button>
          )}
          <button onClick={handleSubmit} className="btn btn-primary">
            {task ? "Modifier" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Offline Storage Class
class PlanningOfflineStorage {
  constructor() {
    this.dbName = "FleemyPlanningDB";
    this.db = null;
  }

  async init() {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      // Always open the DB without specifying a version to get the
      // latest existing version automatically
      const request = indexedDB.open(this.dbName);

      request.onerror = () => {
        console.error("IndexedDB open error", request.error);
        reject(request.error);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("events")) {
          const store = db.createObjectStore("events", { keyPath: "id" });
          store.createIndex("week_year", ["week", "year"]);
          store.createIndex("uid", "uid");
        }
        if (!db.objectStoreNames.contains("tasks")) {
          const store = db.createObjectStore("tasks", { keyPath: "id" });
          store.createIndex("week_year", ["week", "year"]);
          store.createIndex("uid", "uid");
        }
        console.log(`IndexedDB upgraded to version ${db.version}`);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.version = this.db.version;

        const missingStores = [];
        if (!this.db.objectStoreNames.contains("events"))
          missingStores.push("events");
        if (!this.db.objectStoreNames.contains("tasks"))
          missingStores.push("tasks");

        if (missingStores.length === 0) {
          console.log(`IndexedDB opened with version ${this.db.version}`);
          resolve();
        } else {
          // Reopen DB with higher version to create missing stores
          const newVersion = this.db.version + 1;
          this.db.close();
          const upgradeRequest = indexedDB.open(this.dbName, newVersion);

          upgradeRequest.onerror = () => {
            console.error("IndexedDB upgrade error", upgradeRequest.error);
            reject(upgradeRequest.error);
          };

          upgradeRequest.onupgradeneeded = (e) => {
            const upgradeDb = e.target.result;
            if (!upgradeDb.objectStoreNames.contains("events")) {
              const store = upgradeDb.createObjectStore("events", {
                keyPath: "id",
              });
              store.createIndex("week_year", ["week", "year"]);
              store.createIndex("uid", "uid");
            }
            if (!upgradeDb.objectStoreNames.contains("tasks")) {
              const store = upgradeDb.createObjectStore("tasks", {
                keyPath: "id",
              });
              store.createIndex("week_year", ["week", "year"]);
              store.createIndex("uid", "uid");
            }
            console.log(`IndexedDB upgraded to version ${upgradeDb.version}`);
          };

          upgradeRequest.onsuccess = () => {
            this.db = upgradeRequest.result;
            this.version = newVersion;
            console.log(`IndexedDB opened with version ${newVersion}`);
            resolve();
          };
        }
      };
    });
  }

  async saveEvent(event) {
    try {
      if (!this.db) await this.init();
      const transaction = this.db.transaction(["events"], "readwrite");
      const store = transaction.objectStore("events");
      await store.put(event);
    } catch (err) {
      console.error("IndexedDB saveEvent error", err);
      if (err.name === "NotFoundError") {
        this.db = null;
        await this.init();
        return this.saveEvent(event);
      }
    }
  }

  async getEvents(uid, year, week) {
    try {
      if (!this.db) await this.init();
      const transaction = this.db.transaction(["events"], "readonly");
      const store = transaction.objectStore("events");
      const request = store.getAll();

      return await new Promise((resolve) => {
        request.onsuccess = () => {
          const results = Array.isArray(request.result) ? request.result : [];
          const events = results.filter(
            (e) => e.uid === uid && e.year === year && e.week === week,
          );
          resolve(events);
        };
        request.onerror = () => {
          console.error("IndexedDB getEvents error", request.error);
          resolve([]);
        };
      });
    } catch (err) {
      console.error("IndexedDB getEvents error", err);
      if (err.name === "NotFoundError") {
        this.db = null;
        await this.init();
        return this.getEvents(uid, year, week);
      }
      return [];
    }
  }

  async deleteEvent(eventId) {
    try {
      if (!this.db) await this.init();
      const transaction = this.db.transaction(["events"], "readwrite");
      const store = transaction.objectStore("events");
      await store.delete(eventId);
    } catch (err) {
      console.error("IndexedDB deleteEvent error", err);
    }
  }

  async saveTask(task) {
    try {
      if (!this.db) await this.init();
      const tx = this.db.transaction(["tasks"], "readwrite");
      const store = tx.objectStore("tasks");
      await store.put(task);
    } catch (err) {
      console.error("IndexedDB saveTask error", err);
    }
  }

  async getTasks(uid, year, week) {
    try {
      if (!this.db) await this.init();
      const tx = this.db.transaction(["tasks"], "readonly");
      const store = tx.objectStore("tasks");
      const request = store.getAll();
      return await new Promise((resolve) => {
        request.onsuccess = () => {
          const results = Array.isArray(request.result) ? request.result : [];
          const tasks = results.filter(
            (t) => t.uid === uid && t.year === year && t.week === week,
          );
          resolve(tasks);
        };
        request.onerror = () => {
          console.error("IndexedDB getTasks error", request.error);
          resolve([]);
        };
      });
    } catch (err) {
      console.error("IndexedDB getTasks error", err);
      return [];
    }
  }

  async deleteTask(taskId) {
    try {
      if (!this.db) await this.init();
      const tx = this.db.transaction(["tasks"], "readwrite");
      const store = tx.objectStore("tasks");
      await store.delete(taskId);
    } catch (err) {
      console.error("IndexedDB deleteTask error", err);
    }
  }

  async clearWeekEvents(uid, year, week) {
    try {
      if (!this.db) await this.init();
      const transaction = this.db.transaction(["events", "tasks"], "readwrite");
      const eventStore = transaction.objectStore("events");
      const taskStore = transaction.objectStore("tasks");
      const requestEvents = eventStore.getAll();
      const requestTasks = taskStore.getAll();

      return await new Promise((resolve) => {
        let done = 0;
        const checkDone = () => {
          done += 1;
          if (done === 2) resolve();
        };
        requestEvents.onsuccess = () => {
          const results = Array.isArray(requestEvents.result)
            ? requestEvents.result
            : [];
          results
            .filter((e) => e.uid === uid && e.year === year && e.week === week)
            .forEach((e) => eventStore.delete(e.id));
          checkDone();
        };
        requestEvents.onerror = () => {
          console.error(
            "IndexedDB clearWeekEvents (events) error",
            requestEvents.error,
          );
          checkDone();
        };
        requestTasks.onsuccess = () => {
          const results = Array.isArray(requestTasks.result)
            ? requestTasks.result
            : [];
          results
            .filter((t) => t.uid === uid && t.year === year && t.week === week)
            .forEach((t) => taskStore.delete(t.id));
          checkDone();
        };
        requestTasks.onerror = () => {
          console.error(
            "IndexedDB clearWeekEvents (tasks) error",
            requestTasks.error,
          );
          checkDone();
        };
      });
    } catch (err) {
      console.error("IndexedDB clearWeekEvents error", err);
      if (err.name === "NotFoundError") {
        this.db = null;
        await this.init();
        return this.clearWeekEvents(uid, year, week);
      }
    }
  }
}

// Main Planning Component
const Planning = ({ user }) => {
  const [view, setView] = useState("week"); // 'week' or 'month'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]); // Add tasks state
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [eventModal, setEventModal] = useState({
    isOpen: false,
    event: null,
    timeSlot: null,
    selectedDate: null,
  });
  const [taskModal, setTaskModal] = useState({
    isOpen: false,
    task: null,
    prefillSlot: null,
  }); // Add task modal state
  const [dayEventsModal, setDayEventsModal] = useState({
    isOpen: false,
    events: [],
    date: null,
  });
  const { team } = useTeam();
  const [selectedMemberUid, setSelectedMemberUid] = useState(() =>
    localStorage.getItem("selectedMemberUid") || "",
  );
  const [hourlyRate, setHourlyRate] = useState(50);
  const [showRateModal, setShowRateModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineStorage] = useState(new PlanningOfflineStorage());
  const [errorMessage, setErrorMessage] = useState(null);
  const [weekData, setWeekData] = useState({});
  const [copiedItem, setCopiedItem] = useState(null);

  const viewingMember =
    selectedMemberUid && selectedMemberUid !== user?.uid
      ? team?.members?.find((m) => m.uid === selectedMemberUid) || {
          uid: selectedMemberUid,
        }
      : null;
  const isReadOnly = selectedMemberUid !== user?.uid;

  const backendDayNames = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  const parseEvent = (evt) => {
    const clone = { ...evt };

    let dayIndex = clone.day;

    // Convert and normalize start/end to HH:MM format
    let start = clone.start_time || clone.start || clone.startTime || "00:00";
    let end = clone.end_time || clone.end || clone.endTime || "00:00";
    start = normalizeTime(start);
    end = normalizeTime(end);

    if (dayIndex == null && clone.start) {
      const d = new Date(clone.start);
      dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1;
      clone.week = clone.week ?? getWeekNumber(d);
      clone.year = clone.year ?? d.getFullYear();
    } else if (typeof dayIndex === "string") {
      dayIndex = backendDayNames.indexOf(dayIndex.toLowerCase());
    }

    return {
      ...clone,
      day: dayIndex,
      start,
      end,
      start_time: start,
      end_time: end,
      startTime: start,
      endTime: end,
      title: clone.title || clone.description || "",
      color: clone.color || "#3b82f6",
      icon: clone.icon || "",
      revenue: clone.revenue || 0,
      type: clone.status || clone.type,
    };
  };

  const currentYear = currentDate.getFullYear();
  const currentWeek = getWeekNumber(currentDate);
  const currentMonth = currentDate.getMonth();
  const weekKey = `${currentYear}-W${currentWeek}`;
  const currentWeekEvents = (weekData?.[weekKey]?.events || []).filter(
    (e) => e.uid === selectedMemberUid,
  );

  const renderPlanning = () => {
    if (weekData[weekKey]) {
      setEvents(weekData[weekKey].events || []);
    }
  };

  useEffect(() => {
    renderPlanning();
  }, [weekData, weekKey]);

  useEffect(() => {
    // Initialize offline storage
    offlineStorage.init();

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedMemberUid) {
      localStorage.setItem("selectedMemberUid", selectedMemberUid);
    }
  }, [selectedMemberUid]);

  useEffect(() => {
    if (user && !selectedMemberUid) {
      setSelectedMemberUid(user.uid);
    }
  }, [user, selectedMemberUid]);

  useEffect(() => {
    if (team) {
      const exists = team.members.some((m) => m.uid === selectedMemberUid);
      if (!exists) {
        setSelectedMemberUid(user?.uid);
      }
    }
  }, [team]);

  const apiCall = async (url, options = {}) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    if (!user) {
      console.error("[apiCall] utilisateur non connecté"); // ✅ CHECKED auth
      try {
        return await api({ url, ...options });
      } catch (err) {
        console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
        throw err;
      }
    }

    let token;
    try {
      token = await user.getIdToken(); // ✅ FIXED token/projectId/trace
    } catch (err) {
      console.error("[apiCall] impossible d'obtenir le token:", err); // ✅ FIXED token/projectId/trace
      throw err;
    }
    try {
      const resp = await api({
        url,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        ...options,
      });
      if (resp.data && resp.data.success === false) {
        showToast(resp.data.error || "Erreur serveur", true);
      }
      return resp;
    } catch (error) {
      if (!isOnline) {
        throw new Error("Offline mode");
      }
      console.error(`[apiCall] échec appel ${url}:`, error); // ✅ FIXED token/projectId/trace
      throw error;
    }
  };

  const apiCallWithRetry = async (url, options = {}, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await apiCall(url, options);
      } catch (err) {
        if (i === retries - 1) {
          throw err;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  };

  const loadEvents = async (year, week, uid = selectedMemberUid) => {
    let eventsData = [];
    let tasksData = [];
    const month = new Date(year, 0, 1 + (week - 1) * 7).getMonth();
    const weekKey = `${year}-W${week}`;

    // Use selected member when viewing a teammate's planning
    const ownerId = uid || user?.uid;

    try {
      setErrorMessage(null);
      setLoading(true);

      const teamParam =
        uid !== user?.uid && team
          ? `?team_id=${team.id || team.team_id}`
          : "";
      // ✅ FIXED for production: safe ownerId retrieval
      if (!ownerId) {
        console.error("ownerId non défini");
        return;
      }
      const token = await user.getIdToken(); // ✅ CHECKED auth
      console.log("token loadEvents", token); // ✅ CHECKED auth
      eventsData = weekData[weekKey]?.events
        ? weekData[weekKey].events.map((e) => ({ ...e }))
        : [];

      if (view === "week") {
        // Load events from IndexedDB first so the UI is populated immediately
        const preEvents = await offlineStorage.getEvents(
          ownerId,
          year,
          week,
        );
        console.log(
          `[IndexedDB] Preloaded ${preEvents.length} events before API call`,
        );
        const preParsed = preEvents.map(parseEvent);
        const mapEv = new Map(eventsData.map((e) => [e.id, e]));
        preParsed.forEach((e) => mapEv.set(e.id, e));
        eventsData = Array.from(mapEv.values());
        if (uid !== user?.uid) {
          eventsData = eventsData.filter((e) => e.uid === uid);
        }
        setEvents(eventsData);

        let apiEvents = [];
        let apiSuccess = false;
        try {
          const eventsResponse = await apiCallWithRetry(
            `/planning/events/${ownerId}/${year}/${week}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          console.log("/planning/events response", eventsResponse.data);
          if (
            eventsResponse.data &&
            eventsResponse.data.success &&
            Array.isArray(eventsResponse.data.events)
          ) {
            apiEvents = eventsResponse.data.events
              .filter(
                (ev) =>
                  ev &&
                  ev.id &&
                  (ev.startTime || ev.start_time) &&
                  (ev.endTime || ev.end_time),
              )
              .map(parseEvent);
            apiSuccess = true;
            console.log(
              `Loaded ${apiEvents.length} valid events from Firestore`,
            );
          } else {
            console.error(
              "Event load failed:",
              eventsResponse.data?.error || eventsResponse.status,
            );
            showToast(
              eventsResponse.data?.error ||
                "Erreur lors du chargement des événements",
              true,
            );
            console.log("Firestore fetch failed, staying in offline mode");
            showToast("Mode hors ligne", true);
          }
        } catch (err) {
          console.error("Event API error", err);
          console.log("Firestore fetch threw an error, using offline data");
          showToast("Mode hors ligne", true);
        }

        if (apiSuccess) {
          const eventMap = new Map();
          preEvents.map(parseEvent).forEach((e) => eventMap.set(e.id, e));
          apiEvents.forEach((e) => eventMap.set(e.id, e));
          eventsData = Array.from(eventMap.values());
          console.log(`[API] Events after merge`, eventsData);
        } else {
          eventsData = preEvents.map(parseEvent);
          console.log("Using IndexedDB fallback for events", eventsData);
        }

        const tasksResponse = await apiCallWithRetry(
          `/planning/week/${year}/${week}${teamParam}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        console.log("/planning/week response", tasksResponse.data);
        if (tasksResponse.data && tasksResponse.data.success) {
          if (Array.isArray(tasksResponse.data.tasks)) {
            tasksData = tasksResponse.data.tasks;
            if (uid !== user?.uid) {
              tasksData = tasksData.filter((t) => t.uid === uid);
            }
          }
          if (Array.isArray(tasksResponse.data.events)) {
            const weekEvents = tasksResponse.data.events.map(parseEvent);
            const map = new Map(eventsData.map((e) => [e.id, e]));
            weekEvents.forEach((e) => map.set(e.id, e));
            eventsData = Array.from(map.values());
          }
        } else {
          console.error(
            "Task load failed:",
            tasksResponse.data?.error || tasksResponse.status,
          );
          showToast(
            tasksResponse.data?.error || "Erreur lors du chargement des tâches",
            true,
          );
          const offlineTasks = await offlineStorage.getTasks(
            ownerId,
            year,
            week,
          );
          tasksData = offlineTasks;
        }

        if (uid !== user?.uid) {
          eventsData = eventsData.filter((e) => e.uid === uid);
        }

        setEvents(eventsData);
        setTasks(tasksData);

        if (apiSuccess) {
          // Synchronize IndexedDB with data from Firestore and local events
          await offlineStorage.clearWeekEvents(ownerId, year, week);
          for (const evt of eventsData) {
            await offlineStorage.saveEvent({ ...evt, uid: ownerId });
          }
          console.log(
            "Firestore succeeded - IndexedDB synchronized with latest events",
          );
          console.log("[IndexedDB] Stored events", eventsData);
        }
      } else {
        const response = await apiCallWithRetry(
          `/planning/month/${year}/${month}${teamParam}`,
        );
        if (response.data && response.data.success === false) {
          console.error("Month load failed:", response.data.error);
          showToast(
            response.data.error || "Erreur lors du chargement du planning",
            true,
          );
          setEvents([]);
          setTasks([]);
        } else {
          eventsData = Array.isArray(response.data.events)
            ? response.data.events.map(parseEvent)
            : [];
          tasksData = Array.isArray(response.data.tasks)
            ? response.data.tasks
            : [];
          if (uid !== user?.uid) {
            eventsData = eventsData.filter((e) => e.uid === uid);
            tasksData = tasksData.filter((t) => t.uid === uid);
          }
          setEvents(eventsData);
          setTasks(tasksData);
        }
      }

      setTransitioning(false);
    } catch (error) {
      console.error("Error loading events:", error);
      try {
        const offlineEvents = await offlineStorage.getEvents(
          ownerId,
          year,
          week,
        );
        const offlineTasks = await offlineStorage.getTasks(
          ownerId,
          year,
          week,
        );
        eventsData = offlineEvents.map(parseEvent);
        tasksData = offlineTasks;
        setEvents(eventsData);
        setTasks(tasksData);
        console.log("Using IndexedDB fallback for events", eventsData);
      } catch (idbError) {
        console.error("Fallback IndexedDB error", idbError);
        eventsData = [];
        tasksData = [];
        setEvents([]);
        setTasks([]);
      }
      setTransitioning(false);
    } finally {
      setLoading(false);
    }
    setWeekData((prev) => ({
      ...prev,
      [weekKey]: { ...(prev[weekKey] || {}), events: eventsData },
    }));
    console.log("[loadEvents] final events", eventsData);
    return { success: true, events: eventsData };
  };

  // Revenue Summary Component - Colorized Cards
  const RevenueSummary = ({
    events,
    tasks,
    currentWeek,
    currentYear,
    hourlyRate,
  }) => {
    const calculateRevenue = () => {
      const safeEvents = Array.isArray(events) ? events : [];
      const safeTasks = Array.isArray(tasks) ? tasks : [];
      const weekEvents = safeEvents.filter(
        (e) => e.week === currentWeek && e.year === currentYear,
      );
      const weekTasks = safeTasks.filter(
        (t) => t.week === currentWeek && t.year === currentYear,
      );
      const revenue = { paid: 0, unpaid: 0, pending: 0 };

      // Calculate revenue from events
      weekEvents.forEach((event) => {
        const statusValue =
          event.status || event.payment_status || event.type || "pending";
        if (statusValue !== "not_worked") {
          const startTime = event.start_time || event.start || "09:00";
          const endTime = event.end_time || event.end || "10:00";
          const startHour = parseInt(startTime.split(":")[0]);
          const endHour = parseInt(endTime.split(":")[0]);
          const hours = endHour - startHour;
          const amount = hours * hourlyRate;

          const eventType = statusValue;
          switch (eventType) {
            case "paid":
              revenue.paid += amount;
              break;
            case "unpaid":
              revenue.unpaid += amount;
              break;
            case "pending":
              revenue.pending += amount;
              break;
          }
        }
      });

      // Calculate revenue from tasks (always considered as paid)
      weekTasks.forEach((task) => {
        if (task.time_slots) {
          task.time_slots.forEach((slot) => {
            const startHour = parseInt(slot.start.split(":")[0]);
            const endHour = parseInt(slot.end.split(":")[0]);
            const hours = endHour - startHour;
            const amount = hours * (task.price || 0);
            revenue.paid += amount;
          });
        }
      });

      return revenue;
    };

    const revenue = calculateRevenue();

    return (
      <div className="revenue-cards">
        <div className="revenue-card revenue-card-paid">
          <div className="revenue-amount">{revenue.paid}€</div>
          <div className="revenue-label">Revenus payés</div>
        </div>
        <div className="revenue-card revenue-card-unpaid">
          <div className="revenue-amount">{revenue.unpaid}€</div>
          <div className="revenue-label">Revenus impayés</div>
        </div>
        <div className="revenue-card revenue-card-pending">
          <div className="revenue-amount">{revenue.pending}€</div>
          <div className="revenue-label">Revenus en attente</div>
        </div>
      </div>
    );
  };

  // Navigation Header Components - Smooth Transitions
  const WeekNavigationHeader = ({
    currentDate,
    currentWeek,
    currentYear,
    monthNames,
    onNavigate,
    transitioning,
  }) => {
    const weekDates = getWeekDates(currentYear, currentWeek);

    return (
      <div
        className={`week-navigation ${transitioning ? "transitioning" : ""}`}
      >
        <button
          onClick={() => onNavigate("week", -1)}
          className={`week-nav-btn ${transitioning ? "loading" : ""}`}
          disabled={transitioning}
        >
          {!transitioning && "◀"}
        </button>

        <h2 className={`week-title ${transitioning ? "updating" : ""}`}>
          Semaine {currentWeek} - {monthNames[weekDates[0].getMonth()]}{" "}
          {currentYear}
        </h2>

        <button
          onClick={() => onNavigate("week", 1)}
          className={`week-nav-btn ${transitioning ? "loading" : ""}`}
          disabled={transitioning}
        >
          {!transitioning && "▶"}
        </button>
      </div>
    );
  };

  const MonthNavigationHeader = ({
    currentDate,
    currentMonth,
    currentYear,
    monthNames,
    onNavigate,
    transitioning,
  }) => {
    return (
      <div
        className={`week-navigation ${transitioning ? "transitioning" : ""}`}
      >
        <button
          onClick={() => onNavigate("month", -1)}
          className={`week-nav-btn ${transitioning ? "loading" : ""}`}
          disabled={transitioning}
        >
          {!transitioning && "◀"}
        </button>

        <h2 className={`week-title ${transitioning ? "updating" : ""}`}>
          {monthNames[currentMonth]} {currentYear}
        </h2>

        <button
          onClick={() => onNavigate("month", 1)}
          className={`week-nav-btn ${transitioning ? "loading" : ""}`}
          disabled={transitioning}
        >
          {!transitioning && "▶"}
        </button>
      </div>
    );
  };

  // Month View Components - Ultra Clean Design
  const MonthHeader = ({ dayLabels }) => {
    return (
      <div className="month-header">
        {dayLabels.map((day, index) => (
          <div key={index} className="month-day-label">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const MonthEvent = ({ event, onClick }) => {
    const statusValue =
      (typeof event.status === "string" && event.status.trim()) ||
      (typeof event.payment_status === "string" && event.payment_status.trim()) ||
      (typeof event.type === "string" && event.type.trim()) ||
      "pending";
    const normalizedStatus = statusValue.toLowerCase();
    const eventClass = `month-event ${
      normalizedStatus === "paid"
        ? "event-meeting"
        : normalizedStatus === "unpaid"
          ? "event-task"
          : normalizedStatus === "pending"
            ? "event-break"
            : "event-notworked"
    }`;

    return (
      <div
        className={eventClass}
        onClick={(e) => {
          e.stopPropagation();
          onClick(event);
        }}
      >
        {event.description}
      </div>
    );
  };

  const MonthGrid = ({
    monthData,
    onDayClick,
    onEventClick,
    getEventsForDate,
    viewingMember,
  }) => {
    const rows = [];
    for (let i = 0; i < monthData.length; i += 7) {
      rows.push(monthData.slice(i, i + 7));
    }

    return (
      <div className="month-grid">
        {rows.map((week, weekIndex) => (
          <div key={weekIndex} className="month-week">
            {week.map((day, dayIndex) => {
              if (!day) {
                return <div key={dayIndex} className="month-day empty" />;
              }

              const dayEvents = getEventsForDate(day.date);
              const visibleEvents = dayEvents.slice(0, 2);
              const remainingCount = dayEvents.length - visibleEvents.length;
              const isToday =
                day.date.toDateString() === new Date().toDateString();
              const isCurrentMonth = day.isCurrentMonth;

              return (
                <div
                  key={dayIndex}
                  className={`month-day ${
                    !isCurrentMonth ? "other-month" : ""
                  } ${isToday ? "today" : ""}`}
                  onClick={() => onDayClick(day.date)}
                >
                  <div className="month-day-number">{day.date.getDate()}</div>

                  <div className="month-day-events">
                    {visibleEvents.map((event) => (
                      <MonthEvent
                        key={event.id}
                        event={event}
                        onClick={onEventClick}
                      />
                    ))}
                    {remainingCount > 0 && (
                      <div
                        className="month-more-events"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDayClick(day.date);
                        }}
                      >
                        +{remainingCount} autres
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };
  const DayHeader = ({ weekDates, dayNames }) => {
    return (
      <div className="planning-days-header">
        <div className="planning-time-placeholder"></div>
        {weekDates.map((date, index) => (
          <div key={index} className="planning-day-header">
            {dayNames[index]} {date.getDate()}
          </div>
        ))}
      </div>
    );
  };

  const HourLabels = ({ timeSlots }) => {
    // Add 18h to the end for final alignment
    const allTimeSlots = [...timeSlots]; // This includes 18:00 already

    return (
      <div className="planning-hours-sidebar">
        {allTimeSlots.map((time, index) => (
          <div key={index} className="planning-hour-cell">
            {time}
          </div>
        ))}
      </div>
    );
  };

  const GridBody = ({
    timeSlots,
    dayNames,
    events,
    tasks = [],
    currentWeek,
    currentYear,
    onTimeSlotClick,
    onEventClick,
    onTaskClick,
    viewingMember,
    transitioning,
    selectedMemberUid,
  }) => {
    const getEventsForTimeSlot = (day, time) => {
      const safeEvents = Array.isArray(events)
        ? events.filter((e) => e.uid === selectedMemberUid)
        : [];
      return safeEvents.filter(
        (event) =>
          event.day === day &&
          (event.start_time || event.start) === time &&
          event.week === currentWeek &&
          event.year === currentYear,
      );
    };

    const getTasksForTimeSlot = (day, time) => {
      const dayName = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ][day];
      const safeTasks = Array.isArray(tasks) ? tasks : [];
      return safeTasks.filter(
        (task) =>
          task.week === currentWeek &&
          task.year === currentYear &&
          task.time_slots?.some(
            (slot) => slot.day === dayName && slot.start === time,
          ),
      );
    };

    const hasEventInTimeSlot = (day, time) => {
      return getEventsForTimeSlot(day, time).length > 0;
    };

    return (
      <div className="planning-grid-body">
        {timeSlots.slice(0, -1).map((time, timeIndex) => (
          <div key={time} className="planning-grid-row">
            {dayNames.map((dayName, dayIndex) => {
              const slotEvents = getEventsForTimeSlot(dayIndex, time);
              const slotTasks = getTasksForTimeSlot(dayIndex, time);
              const hasEvent = hasEventInTimeSlot(dayIndex, time);

              return (
                <div
                  key={dayIndex}
                  className={`planning-grid-cell ${
                    selectedMemberUid !== user?.uid ? "readonly" : ""
                  }`}
                  onClick={() =>
                    !isReadOnly && onTimeSlotClick(dayIndex, time)
                  }
                >
                  {/* Display events */}
                  {slotEvents.map((event) => {
                    const statusValue =
                      (typeof event.status === "string" && event.status.trim()) ||
                      (typeof event.payment_status === "string" && event.payment_status.trim()) ||
                      (typeof event.type === "string" && event.type.trim()) ||
                      "pending";
                    const normalizedStatus = statusValue.toLowerCase();

                    return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={`planning-event ${
                        normalizedStatus === "paid"
                          ? "event-meeting"
                          : normalizedStatus === "unpaid"
                            ? "event-task"
                            : normalizedStatus === "pending"
                              ? "event-break"
                              : "event-notworked"
                      } ${transitioning ? "" : "new-event"}`}
                    >
                      <div className="planning-event-description">
                        {event.description}
                      </div>
                      <div className="planning-event-time">
                        {event.start_time || event.start} -{" "}
                        {event.end_time || event.end}
                      </div>
                      {event.client_name && (
                        <div className="planning-event-client">
                          {event.client_name}
                        </div>
                      )}
                    </div>
                  );
                  })}

                  {/* Display tasks - conditional rendering based on event presence */}
                  {slotTasks.map((task) => {
                    if (hasEvent) {
                      // If there's an event, show task as icon in corner
                      return (
                        <div
                          key={task.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTaskClick && onTaskClick(task);
                          }}
                          className="planning-task-icon"
                          style={{
                            position: "absolute",
                            top: "4px",
                            right: "4px",
                            width: "16px",
                            height: "16px",
                            backgroundColor: task.color,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                            cursor: "pointer",
                            zIndex: 20,
                          }}
                          title={task?.name ?? ""}
                        >
                          {task.icon}
                        </div>
                      );
                    } else {
                      // If no event, show task as colored block
                      return (
                        <div
                          key={task.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTaskClick && onTaskClick(task);
                          }}
                          className="planning-task-block"
                          style={{
                            position: "absolute",
                            top: "2px",
                            left: "2px",
                            right: "2px",
                            bottom: "2px",
                            backgroundColor: task.color,
                            borderRadius: "4px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            opacity: 0.8,
                            fontSize: "12px",
                            color: "#fff",
                            textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                          }}
                        >
                          <div
                            style={{ fontSize: "16px", marginBottom: "2px" }}
                          >
                            {task.icon}
                          </div>
                          <div style={{ fontSize: "10px", fontWeight: 500 }}>
                            {task?.name ?? ""}
                          </div>
                        </div>
                      );
                    }
                  })}

                  {/* Smooth loading skeleton during transition */}
                  {transitioning && (
                    <div
                      className="planning-skeleton"
                      style={{
                        width: "90%",
                        height: "16px",
                        borderRadius: "2px",
                        margin: "4px auto",
                      }}
                    ></div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };


  const loadUserRate = async () => {
    try {
      const response = await apiCallWithRetry("/auth/me");
      if (response.data && response.data.success === false) {
        setErrorMessage(response.data.error);
      } else if (response.data && response.data.user == null) {
        setHourlyRate(50);
      } else {
        setHourlyRate(response.data.hourly_rate || 50);
      }
    } catch (error) {
      console.error("Error loading user rate:", error);
      setErrorMessage("Erreur lors du chargement des informations utilisateur");
    }
  };

  useEffect(() => {
    if (user && selectedMemberUid && !transitioning) {
      loadEvents(currentYear, currentWeek, selectedMemberUid);
    }
  }, [user, selectedMemberUid, currentYear, currentWeek, transitioning]);

  useEffect(() => {
    // Load user rate only on mount
    loadUserRate();
  }, []);

  const handleCreateEvent = async (eventData) => {
    // ✅ FIXED for production
    const ownerId = user?.uid;
    if (!ownerId) {
      console.error("ownerId non défini");
      return;
    }
    try {
      const eventToCreate = {
        description: eventData.description || "", // Description facultative
        client_id: eventData.type === "absence" ? "" : eventData.client_id || "",
        client_name:
          eventData.type === "absence" ? "" : eventData.client_name || "", // Client obligatoire (validé dans la modal)
        day: dayNames[eventData.day].toLowerCase(),
        start_time: eventData.start,
        end_time: eventData.end,
        status: eventData.payment_status || eventData.status || "pending",
        type: eventData.type === "absence" ? "absence" : "normal",
        uid: ownerId,
        week: currentWeek,
        year: currentYear,
      };

      // Save to server
      const response = await apiCall("/planning/events", {
        method: "POST",
        data: eventToCreate,
      });

      if (response.data && response.data.success === false) {
        showToast(response.data.error || "Erreur serveur", true);
        const localEvent = {
          ...eventData,
          uid: ownerId,
          week: currentWeek,
          year: currentYear,
          id: Date.now().toString(),
          created_at: new Date().toISOString(),
        };
        await offlineStorage.saveEvent(localEvent);
        setEvents((prev) => [...prev, localEvent]);
        const wk = `${currentYear}-W${currentWeek}`;
        setWeekData((prev) => ({
          ...prev,
          [wk]: {
            ...(prev[wk] || {}),
            events: [...(prev[wk]?.events || []), localEvent],
          },
        }));
        setEventModal({
          isOpen: false,
          event: null,
          timeSlot: null,
          selectedDate: null,
        });
        return;
      }

      const createdEvent = response.data.event;

      // Save to offline storage
      await offlineStorage.saveEvent(createdEvent);

      // Update local state immediately
      const newEvent = {
        ...createdEvent,
        day: eventData.day, // Keep day as number for local filtering
        start: eventData.start, // Keep both formats for compatibility
        end: eventData.end,
      };

      console.log(`Élément enregistré avec succès (ID: ${createdEvent.id})`);
      showToast(`Élément enregistré avec succès (ID: ${createdEvent.id})`);

      setEvents((prevEvents) => [...prevEvents, newEvent]);
      const wk = `${currentYear}-W${currentWeek}`;
      setWeekData((prev) => ({
        ...prev,
        [wk]: {
          ...(prev[wk] || {}),
          events: [...(prev[wk]?.events || []), newEvent],
        },
      }));
      setEventModal({
        isOpen: false,
        event: null,
        timeSlot: null,
        selectedDate: null,
      });

      // Force revenue recalculation
      setTimeout(() => {
        // This will trigger a re-render with updated revenue
      }, 100);
    } catch (error) {
      console.error("Error creating event:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
      // If offline, save locally only
      if (!isOnline) {
        const eventToCreateLocal = {
          ...eventData,
          description: eventData.description || "",
          uid: ownerId,
          week: currentWeek,
          year: currentYear,
          id: Date.now().toString(),
          created_at: new Date().toISOString(),
        };
        await offlineStorage.saveEvent(eventToCreateLocal);
        setEvents((prevEvents) => [...prevEvents, eventToCreateLocal]);
        const wk = `${currentYear}-W${currentWeek}`;
        setWeekData((prev) => ({
          ...prev,
          [wk]: {
            ...(prev[wk] || {}),
            events: [...(prev[wk]?.events || []), eventToCreateLocal],
          },
        }));
        setEventModal({
          isOpen: false,
          event: null,
          timeSlot: null,
          selectedDate: null,
        });
      }
    }
  };

  const handleUpdateEvent = async (eventData) => {
    // ✅ FIXED for production
    try {
      const updateData = {
        description: eventData.description,
        client_id: eventData.type === "absence" ? "" : eventData.client_id || "",
        client_name: eventData.type === "absence" ? "" : eventData.client_name || "",
        day: dayNames[eventData.day].toLowerCase(),
        start_time: eventData.start,
        end_time: eventData.end,
        status: eventData.payment_status || eventData.status || "pending",
        type: eventData.type === "absence" ? "absence" : "normal",
      };

      const response = await apiCall(
        `/planning/events/${eventModal.event.id}`,
        {
          method: "PUT",
          data: updateData,
        },
      );
      if (response.data && response.data.success === false) {
        showToast(response.data.error || "Erreur serveur", true);
        const offlineUpdate = {
          ...eventModal.event,
          ...updateData,
        };
        await offlineStorage.saveEvent(offlineUpdate);
        setEvents((prevEvents) =>
          prevEvents.map((evt) =>
            evt.id === eventModal.event.id
              ? {
                  ...evt,
                  ...updateData,
                  day: eventData.day,
                  start: eventData.start,
                  end: eventData.end,
                }
              : evt,
          ),
        );
        const wk = `${eventModal.event.year}-W${eventModal.event.week}`;
        setWeekData((prev) => ({
          ...prev,
          [wk]: {
            ...(prev[wk] || {}),
            events: (prev[wk]?.events || []).map((evt) =>
              evt.id === eventModal.event.id
                ? {
                    ...evt,
                    ...updateData,
                    day: eventData.day,
                    start: eventData.start,
                    end: eventData.end,
                  }
                : evt,
            ),
          },
        }));
        setEventModal({
          isOpen: false,
          event: null,
          timeSlot: null,
          selectedDate: null,
        });
        return;
      }
      const updatedEvent = response.data.event;
      console.log(
        `Élément enregistré avec succès (ID: ${eventModal.event.id})`,
      );
      showToast(`Élément enregistré avec succès (ID: ${eventModal.event.id})`);

      await offlineStorage.saveEvent(updatedEvent);

      // Update local state immediately
      setEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.id === eventModal.event.id
            ? {
                ...event,
                ...updateData,
                day: eventData.day, // Keep day as number for local filtering
                start: eventData.start, // Keep both formats for compatibility
                end: eventData.end,
              }
            : event,
        ),
      );
      const wk = `${eventModal.event.year}-W${eventModal.event.week}`;
      setWeekData((prev) => ({
        ...prev,
        [wk]: {
          ...(prev[wk] || {}),
          events: (prev[wk]?.events || []).map((evt) =>
            evt.id === eventModal.event.id
              ? {
                  ...evt,
                  ...updateData,
                  day: eventData.day,
                  start: eventData.start,
                  end: eventData.end,
                }
              : evt,
          ),
        },
      }));

      setEventModal({
        isOpen: false,
        event: null,
        timeSlot: null,
        selectedDate: null,
      });
    } catch (error) {
      console.error("Error updating event:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
      if (!isOnline) {
        const offlineUpdate = {
          ...eventModal.event,
          ...updateData,
          day: eventData.day,
          start: eventData.start,
          end: eventData.end,
        };
        await offlineStorage.saveEvent(offlineUpdate);
        setEvents((prevEvents) =>
          prevEvents.map((evt) =>
            evt.id === offlineUpdate.id ? { ...evt, ...offlineUpdate } : evt,
          ),
        );
        const wk = `${offlineUpdate.year}-W${offlineUpdate.week}`;
        setWeekData((prev) => ({
          ...prev,
          [wk]: {
            ...(prev[wk] || {}),
            events: (prev[wk]?.events || []).map((evt) =>
              evt.id === offlineUpdate.id ? { ...evt, ...offlineUpdate } : evt,
            ),
          },
        }));
        setEventModal({
          isOpen: false,
          event: null,
          timeSlot: null,
          selectedDate: null,
        });
      }
    }
  };

  const handleDeleteEvent = async (eventId) => {
    // ✅ FIXED for production
    try {
      const response = await apiCall(`/planning/events/${eventId}`, {
        method: "DELETE",
      });
      if (response.data && response.data.success === false) {
        showToast(response.data.error || "Erreur serveur", true);
        await offlineStorage.deleteEvent(eventId);
        setEvents((prevEvents) =>
          prevEvents.filter((event) => event.id !== eventId),
        );
        const wk = `${currentYear}-W${currentWeek}`;
        setWeekData((prev) => ({
          ...prev,
          [wk]: {
            ...(prev[wk] || {}),
            events: (prev[wk]?.events || []).filter((e) => e.id !== eventId),
          },
        }));
        setEventModal({
          isOpen: false,
          event: null,
          timeSlot: null,
          selectedDate: null,
        });
        return;
      }

        await offlineStorage.deleteEvent(eventId);

        // Update local state immediately
        setEvents((prevEvents) =>
          prevEvents.filter((event) => event.id !== eventId),
        );
        const wk = `${currentYear}-W${currentWeek}`;
        setWeekData((prev) => ({
          ...prev,
          [wk]: {
            ...(prev[wk] || {}),
            events: (prev[wk]?.events || []).filter((e) => e.id !== eventId),
          },
        }));
        setEventModal({
          isOpen: false,
          event: null,
          timeSlot: null,
          selectedDate: null,
      });
    } catch (error) {
      console.error("Error deleting event:", error);
      if (!isOnline) {
        await offlineStorage.deleteEvent(eventId);
        setEvents((prevEvents) =>
          prevEvents.filter((event) => event.id !== eventId),
        );
        const wk = `${currentYear}-W${currentWeek}`;
        setWeekData((prev) => ({
          ...prev,
          [wk]: {
            ...(prev[wk] || {}),
            events: (prev[wk]?.events || []).filter((e) => e.id !== eventId),
          },
        }));
        setEventModal({
          isOpen: false,
          event: null,
          timeSlot: null,
          selectedDate: null,
        });
      }
    }
  };

  const handleTaskClick = (task) => {
    setTaskModal({ isOpen: true, task, prefillSlot: null });
  };

  const handleCreateTask = async (taskData) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    const ownerId = user?.uid;
    if (!ownerId) {
      console.error("ownerId non défini");
      return;
    }
    try {
      const response = await apiCall("/planning/tasks", {
        method: "POST",
        data: {
          name: taskData.name,
          price: parseFloat(taskData.price) || 0,
          color: taskData.color,
          icon: taskData.icon,
          time_slots: taskData.time_slots || [],
        },
      });
      if (response.data && response.data.success === false) {
        return;
      }
      const createdTask = response.data.task;
      console.log(`Élément enregistré avec succès (ID: ${createdTask.id})`);
      showToast(`Élément enregistré avec succès (ID: ${createdTask.id})`);

      await offlineStorage.saveTask(createdTask);

      // Update local state immediately
      setTasks((prevTasks) => [...prevTasks, createdTask]);
      setTaskModal({ isOpen: false, task: null, prefillSlot: null });
    } catch (error) {
      console.error("Error creating task:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
      if (!isOnline) {
        const localTask = {
          ...taskData,
          id: Date.now().toString(),
          uid: ownerId,
          week: currentWeek,
          year: currentYear,
          created_at: new Date().toISOString(),
        };
        await offlineStorage.saveTask(localTask);
        setTasks((prev) => [...prev, localTask]);
        setTaskModal({ isOpen: false, task: null, prefillSlot: null });
      }
    }
  };

  const handleUpdateTask = async (taskData) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    const ownerId = user?.uid;
    if (!ownerId) {
      console.error("ownerId non défini");
      return;
    }
    try {
      const response = await apiCall(`/planning/tasks/${taskModal.task.id}`, {
        method: "PUT",
        data: {
          name: taskData.name,
          price: parseFloat(taskData.price) || 0,
          color: taskData.color,
          icon: taskData.icon,
          time_slots: taskData.time_slots || [],
        },
      });
      if (response.data && response.data.success === false) {
        return;
      }
      const updatedTask = response.data.task;
      console.log(`Élément enregistré avec succès (ID: ${taskModal.task.id})`);
      showToast(`Élément enregistré avec succès (ID: ${taskModal.task.id})`);

      await offlineStorage.saveTask(updatedTask);

      // Update local state immediately
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task.id === taskModal.task.id ? { ...task, ...taskData } : task,
        ),
      );

      setTaskModal({ isOpen: false, task: null, prefillSlot: null });
    } catch (error) {
      console.error("Error updating task:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
      if (!isOnline) {
        const localTask = {
          ...taskModal.task,
          ...taskData,
          updated_at: new Date().toISOString(),
        };
        await offlineStorage.saveTask(localTask);
        setTasks((prev) =>
          prev.map((t) => (t.id === localTask.id ? localTask : t)),
        );
        setTaskModal({ isOpen: false, task: null, prefillSlot: null });
      }
    }
  };

  const handleDeleteTask = async (taskId) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    const ownerId = user?.uid;
    if (!ownerId) {
      console.error("ownerId non défini");
      return;
    }
    try {
      const response = await apiCall(`/planning/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (response.data && response.data.success === false) {
        showToast(response.data.error || "Erreur serveur", true);
        return;
      }
      await offlineStorage.deleteTask(taskId);
      // Update local state immediately
      setTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
      setTaskModal({ isOpen: false, task: null, prefillSlot: null });
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const handleClearWeek = async () => {
    if (
      window.confirm(
        "Êtes-vous sûr de vouloir supprimer tous les événements de cette semaine ?",
      )
    ) {
      // ✅ FIXED for production
      const ownerId = user?.uid;
      if (!ownerId) {
        console.error("ownerId non défini");
        return;
      }
      try {
        // Delete all events for current week
        const safeEvents = Array.isArray(events) ? events : [];
        const weekEvents = safeEvents.filter(
          (e) => e.week === currentWeek && e.year === currentYear,
        );
        await Promise.all(
          weekEvents.map((event) =>
            apiCall(`/planning/events/${event.id}`, { method: "DELETE" }),
          ),
        );
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        const weekTasks = safeTasks.filter(
          (t) => t.week === currentWeek && t.year === currentYear,
        );
        await Promise.all(
          weekTasks.map((task) =>
            apiCall(`/planning/tasks/${task.id}`, { method: "DELETE" }),
          ),
        );

        await offlineStorage.clearWeekEvents(ownerId, currentYear, currentWeek);

        // Update local state immediately
        setEvents((prevEvents) =>
          prevEvents.filter(
            (event) =>
              !(event.week === currentWeek && event.year === currentYear),
          ),
        );
        setTasks((prevTasks) =>
          prevTasks.filter(
            (task) => !(task.week === currentWeek && task.year === currentYear),
          ),
        );
      } catch (error) {
        console.error("Error clearing week:", error);
      }
    }
  };

  const [transitionDirection, setTransitionDirection] = useState("forward"); // 'forward' or 'backward'

  const navigateWeek = async (direction) => {
    // Set transition direction for animations
    setTransitionDirection(direction > 0 ? "forward" : "backward");
    setTransitioning(true);

    // Update date
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction * 7);
    setCurrentDate(newDate);

    await loadEvents(newDate.getFullYear(), getWeekNumber(newDate), selectedMemberUid);
  };

  const navigateMonth = async (direction) => {
    // Set transition direction for animations
    setTransitionDirection(direction > 0 ? "forward" : "backward");
    setTransitioning(true);

    // Update date
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);

    await loadEvents(newDate.getFullYear(), getWeekNumber(newDate), selectedMemberUid);
  };

  // Unified smooth navigation handler
  const handleNavigation = (type, direction) => {
    if (type === "week") {
      navigateWeek(direction);
    } else {
      navigateMonth(direction);
    }
  };

  const weekDates = getWeekDates(currentYear, currentWeek);

  const getEventsForDate = (date) => {
    const dayOfWeek = date.getDay();
    const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    if (adjustedDay >= 5) return []; // Weekend

    const safeEvents = Array.isArray(events)
      ? events.filter((e) => e.uid === selectedMemberUid)
      : [];
    return safeEvents.filter((event) => {
      const eventDate = new Date(currentYear, 0, 1);
      eventDate.setDate(eventDate.getDate() + (event.week - 1) * 7 + event.day);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const handleTimeSlotClick = (day, start) => {
    if (!isReadOnly) {
      const startIndex = timeSlots.indexOf(start);
      const endTime = timeSlots[startIndex + 1] || "18:00";
      setEventModal({
        isOpen: true,
        event: null,
        timeSlot: { day, start, end: endTime },
        selectedDate: null,
      });
    }
  };

  const handleSwitchToTaskFromEvent = useCallback(
    ({ timeSlot: slot } = {}) => {
      setEventModal({
        isOpen: false,
        event: null,
        timeSlot: null,
        selectedDate: null,
      });
      setTaskModal({ isOpen: true, task: null, prefillSlot: slot || null });
    },
    [],
  );

  const handleDayClick = (date) => {
    const dayEvents = getEventsForDate(date);
    setDayEventsModal({ isOpen: true, events: dayEvents, date });
  };

  const modalAttachedTasks = useMemo(() => {
    if (!eventModal.event) {
      return [];
    }
    const startTime =
      eventModal.event.start ||
      eventModal.event.start_time ||
      eventModal.event.startTime;
    if (!startTime) {
      return [];
    }
    let dayIndex = -1;
    if (typeof eventModal.event.day === "number") {
      dayIndex = eventModal.event.day;
    } else if (typeof eventModal.event.day === "string") {
      const normalized = eventModal.event.day.toLowerCase();
      dayIndex = englishDayNames.indexOf(normalized);
    }
    if (dayIndex < 0 || dayIndex > 6) {
      return [];
    }
    const dayKey = englishDayNames[dayIndex];
    if (!dayKey) {
      return [];
    }

    const safeTasks = Array.isArray(tasks) ? tasks : [];
    return safeTasks.filter((task) =>
      Array.isArray(task.time_slots) &&
      task.time_slots.some((slot) => {
        if (!slot || typeof slot.start !== "string") {
          return false;
        }
        const slotDay =
          typeof slot.day === "string"
            ? slot.day.toLowerCase()
            : typeof slot.day === "number" && englishDayNames[slot.day]
              ? englishDayNames[slot.day]
              : null;
        return slotDay === dayKey && slot.start === startTime;
      }),
    );
  }, [eventModal.event, tasks]);

  const handleEventClick = (event) => {
    if (!isReadOnly) {
      // Only allow editing own events
      setEventModal({
        isOpen: true,
        event,
        timeSlot: null,
        selectedDate: null,
      });
    }
  };

  const handleCreateFromDay = (date) => {
    setDayEventsModal({ isOpen: false, events: [], date: null });
    setEventModal({
      isOpen: true,
      event: null,
      timeSlot: null,
      selectedDate: date,
    });
  };

  const handleCopyEventData = useCallback((item) => {
    if (!item || item.type !== "event") {
      return;
    }
    setCopiedItem(item);
  }, []);

  const handleCopyTaskData = useCallback((item) => {
    if (!item || item.type !== "task") {
      return;
    }
    setCopiedItem(item);
  }, []);

  const updateHourlyRate = async (newRate) => {
    try {
      await apiCall("/auth/me", {
        method: "PUT",
        data: { hourly_rate: newRate },
      });
      setHourlyRate(newRate);
      setShowRateModal(false);
    } catch (error) {
      console.error("Error updating hourly rate:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du planning...</p>
        </div>
      </div>
    );
  }

  console.log("Rendering planning for", selectedMemberUid);

  return (
    <div className="space-y-6">
      {selectedMemberUid !== user?.uid && viewingMember && (
        <div className="bg-yellow-100 text-yellow-800 text-center p-2 rounded">
          Planning de {viewingMember.name || viewingMember.uid} (lecture seule)
        </div>
      )}
      {/* Planning Header */}
      <div className="planning-header">
        <div className="flex items-center space-x-4">
          <h1 className="planning-title">📅 Planning</h1>

          {/* Online/Offline indicator */}
          <div
            className={`status-indicator ${isOnline ? "online" : "offline"}`}
          >
            <span>{isOnline ? "🟢" : "🔴"}</span>
            {isOnline ? "En ligne" : "Hors ligne"}
          </div>
        </div>

        <div className="planning-nav">
          {/* Team member selector */}
          {team && (
            <select
              value={selectedMemberUid}
              onChange={(e) => setSelectedMemberUid(e.target.value)}
              className="form-input"
              style={{ width: "auto", minWidth: "200px" }}
            >
              <option value={user.uid}>Mon planning</option>
              {team.members
                .filter((m) => m.uid !== user.uid)
                .map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {member?.name || member.uid}
                  </option>
                ))}
            </select>
          )}

          {/* View toggle */}
          <button
            onClick={() => setView("week")}
            className={view === "week" ? "active" : ""}
          >
            Semaine
          </button>
          <button
            onClick={() => setView("month")}
            className={view === "month" ? "active" : ""}
          >
            Mois
          </button>

          {/* Actions */}
          {!isReadOnly && (
            <>
              <button
                onClick={() => setShowRateModal(true)}
                className="btn btn-outline"
              >
                {hourlyRate}€/h
              </button>

              {!isReadOnly && (
                <button
                  onClick={handleClearWeek}
                  className="btn btn-outline btn-danger"
                  style={{ marginLeft: "12px" }}
                >
                  Vider semaine
                </button>
              )}

              <button
                onClick={() =>
                  setEventModal({
                    isOpen: true,
                    event: null,
                    timeSlot: null,
                    selectedDate: null,
                  })
                }
                className="btn btn-primary"
              >
                + Événement
              </button>
              <button
                onClick={() =>
                  setTaskModal({ isOpen: true, task: null, prefillSlot: null })
                }
                className="btn btn-secondary"
              >
                + Tâche
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Header */}
      {view === "week" ? (
        <WeekNavigationHeader
          currentDate={currentDate}
          currentWeek={currentWeek}
          currentYear={currentYear}
          monthNames={monthNames}
          onNavigate={handleNavigation}
          transitioning={transitioning}
        />
      ) : (
        <MonthNavigationHeader
          currentDate={currentDate}
          currentMonth={currentMonth}
          currentYear={currentYear}
          monthNames={monthNames}
          onNavigate={handleNavigation}
          transitioning={transitioning}
        />
      )}

      {/* Revenue Summary - Only show for personal view */}
      {view === "week" && selectedMemberUid === user?.uid && (
        <RevenueSummary
          events={events}
          tasks={tasks}
          currentWeek={currentWeek}
          currentYear={currentYear}
          hourlyRate={hourlyRate}
        />
      )}

      {errorMessage && (
        <div className="text-red-500 text-center">{errorMessage}</div>
      )}
      {events?.length === 0 && tasks?.length === 0 && !errorMessage && (
        <p className="text-center text-gray-500">Aucune donnée disponible</p>
      )}

      {/* Planning Table */}
      {view === "week" ? (
        <div
          className={`planning-content ${
            transitioning
              ? transitionDirection === "forward"
                ? "transitioning"
                : "transitioning-reverse"
              : transitionDirection === "backward"
                ? "entering-reverse"
                : ""
          }`}
        >
          <div className="planning-layout">
            <DayHeader weekDates={weekDates} dayNames={dayNames} />
            <div className="planning-grid-container">
              <HourLabels timeSlots={timeSlots} />
              <GridBody
                timeSlots={timeSlots}
                dayNames={dayNames}
                events={currentWeekEvents}
                tasks={tasks}
                currentWeek={currentWeek}
                currentYear={currentYear}
                onTimeSlotClick={handleTimeSlotClick}
                onEventClick={handleEventClick}
                onTaskClick={handleTaskClick}
                viewingMember={viewingMember}
                transitioning={transitioning}
                selectedMemberUid={selectedMemberUid}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Month View - Ultra Clean Design */
        <div
          className={`planning-content ${
            transitioning
              ? transitionDirection === "forward"
                ? "transitioning"
                : "transitioning-reverse"
              : transitionDirection === "backward"
                ? "entering-reverse"
                : ""
          }`}
        >
          <div className="planning-layout">
            <MonthHeader
              dayLabels={["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]}
            />
            <MonthGrid
              monthData={getMonthDays(currentYear, currentMonth)}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              getEventsForDate={getEventsForDate}
              viewingMember={viewingMember}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <EventModal
        isOpen={eventModal.isOpen}
        onClose={() =>
          setEventModal({
            isOpen: false,
            event: null,
            timeSlot: null,
            selectedDate: null,
          })
        }
        onSave={eventModal.event ? handleUpdateEvent : handleCreateEvent}
        onDelete={handleDeleteEvent}
        event={eventModal.event}
        timeSlot={eventModal.timeSlot}
        selectedDate={eventModal.selectedDate}
        attachedTasks={modalAttachedTasks}
        onSwitchToTask={handleSwitchToTaskFromEvent}
        copiedItem={copiedItem}
        onCopy={handleCopyEventData}
      />

      <DayEventsModal
        isOpen={dayEventsModal.isOpen}
        onClose={() =>
          setDayEventsModal({ isOpen: false, events: [], date: null })
        }
        events={dayEventsModal.events}
        date={dayEventsModal.date}
        onEventClick={handleEventClick}
        onCreateEvent={!isReadOnly ? handleCreateFromDay : undefined}
      />

      <TaskModal
        isOpen={taskModal.isOpen}
        onClose={() => setTaskModal({ isOpen: false, task: null, prefillSlot: null })}
        onSave={taskModal.task ? handleUpdateTask : handleCreateTask}
        onDelete={handleDeleteTask}
        task={taskModal.task}
        initialSlot={taskModal.prefillSlot}
        copiedItem={copiedItem}
        onCopy={handleCopyTaskData}
      />

      {/* Hourly Rate Modal */}
      {showRateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-header">Modifier le taux horaire</h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const newRate = parseFloat(formData.get("rate"));
                if (newRate > 0) {
                  updateHourlyRate(newRate);
                }
              }}
            >
              <div className="form-group">
                <label className="form-label">Taux horaire (€)</label>
                <input
                  type="number"
                  name="rate"
                  defaultValue={hourlyRate}
                  step="0.01"
                  min="0"
                  className="form-input"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="btn btn-outline"
                >
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary">
                  Modifier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const TodoList = () => {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "normal",
    due_date: "",
  });

  const apiCall = async (url, options = {}) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    if (!user) {
      console.error("[apiCall] utilisateur non connecté"); // ✅ CHECKED auth
      try {
        return await api({ url, ...options });
      } catch (err) {
        console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
        throw err;
      }
    }

    let token;
    try {
      token = await user.getIdToken(); // ✅ FIXED token/projectId/trace
    } catch (err) {
      console.error("[apiCall] impossible d'obtenir le token:", err); // ✅ FIXED token/projectId/trace
      throw err;
    }
    try {
      return await api({
        url,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(user?.uid ? { "X-User-Id": user.uid } : {}),
          ...options.headers,
        },
        ...options,
      });
    } catch (err) {
      console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
      throw err;
    }
  };

  const loadTodos = async () => {
    try {
      const response = await apiCall("/todos");
      setTodos(response.data);
    } catch (error) {
      console.error("Error loading todos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTodo) {
        await apiCall(`/todos/${editingTodo.id}`, {
          method: "PUT",
          data: formData,
        });
      } else {
        await apiCall("/todos", {
          method: "POST",
          data: formData,
        });
      }
      setShowModal(false);
      setEditingTodo(null);
      setFormData({
        title: "",
        description: "",
        priority: "normal",
        due_date: "",
      });
      loadTodos();
    } catch (error) {
      console.error("Error saving todo:", error);
    }
  };

  const handleToggle = async (todoId) => {
    try {
      await apiCall(`/todos/${todoId}/toggle`, { method: "PUT" });
      loadTodos();
    } catch (error) {
      console.error("Error toggling todo:", error);
    }
  };

  const handleDelete = async (todoId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette tâche ?")) {
      try {
        await apiCall(`/todos/${todoId}`, { method: "DELETE" });
        loadTodos();
      } catch (error) {
        console.error("Error deleting todo:", error);
      }
    }
  };

  const handleEdit = (todo) => {
    setEditingTodo(todo);
    setFormData({
      title: todo.title,
      description: todo.description || "",
      priority: todo.priority,
      due_date: todo.due_date
        ? new Date(todo.due_date).toISOString().split("T")[0]
        : "",
    });
    setShowModal(true);
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const priorityColors = {
    low: "bg-green-100 text-green-700",
    normal: "bg-yellow-100 text-yellow-700",
    urgent: "bg-red-100 text-red-700",
  };

  const priorityLabels = {
    low: "Faible",
    normal: "Normal",
    urgent: "Urgent",
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">📝 To-do List</h1>
        <button
          onClick={() => {
            setEditingTodo(null);
            setFormData({
              title: "",
              description: "",
              priority: "normal",
              due_date: "",
            });
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all"
        >
          + Nouvelle tâche
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {todos.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Aucune tâche
              </h3>
              <p className="text-gray-500">
                Commencez par créer votre première tâche !
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className="p-4 hover:bg-gray-50 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <button
                        onClick={() => handleToggle(todo.id)}
                        className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          todo.completed
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-gray-300 hover:border-green-500"
                        }`}
                      >
                        {todo.completed && "✓"}
                      </button>

                      <div className="flex-1">
                        <h3
                          className={`font-medium ${
                            todo.completed
                              ? "line-through text-gray-500"
                              : "text-gray-800"
                          }`}
                        >
                          {todo.title}
                        </h3>
                        {todo.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {todo.description}
                          </p>
                        )}
                        <div className="flex items-center space-x-3 mt-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              priorityColors[todo.priority]
                            }`}
                          >
                            {priorityLabels[todo.priority]}
                          </span>
                          {todo.due_date && (
                            <span className="text-xs text-gray-500">
                              📅 {formatDate(todo.due_date)}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            Créée le {formatDate(todo.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEdit(todo)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(todo.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                {editingTodo ? "Modifier la tâche" : "Nouvelle tâche"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titre *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows="3"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priorité
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData({ ...formData, priority: e.target.value })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Faible</option>
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date d'échéance
                    </label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) =>
                        setFormData({ ...formData, due_date: e.target.value })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-all"
                  >
                    {editingTodo ? "Modifier" : "Créer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Clients = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm">
    <h1 className="text-2xl font-bold text-gray-800 mb-4">👥 Clients</h1>
    <p className="text-gray-600">
      Module de gestion des clients en développement...
    </p>
  </div>
);

// Quote modal with dynamic lines and automatic calculations
const QuoteModal = ({
  isOpen,
  onClose,
  onSave,
  quote,
  clients,
  defaultClientId,
}) => {
  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    title: "",
    items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
    tax_rate: 20.0,
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    subtotal: 0,
    tax_amount: 0,
    total: 0,
  });

  const [errors, setErrors] = useState({});
  const [appliedInitializationKey, setAppliedInitializationKey] = useState(
    null,
  );

  const buildInitialFormData = useCallback(() => {
    const normalizedDefaultClientId = defaultClientId
      ? String(defaultClientId)
      : "";
    const defaultClient = normalizedDefaultClientId
      ? clients.find((c) => String(c.id) === normalizedDefaultClientId)
      : null;

    if (quote) {
      const items =
        Array.isArray(quote.items) && quote.items.length > 0
          ? quote.items.map((item) => ({
              description: item?.description || "",
              quantity:
                item?.quantity != null ? Number(item.quantity) : 1,
              unit_price:
                item?.unit_price != null ? Number(item.unit_price) : 0,
              total: item?.total != null ? Number(item.total) : 0,
            }))
          : [{ description: "", quantity: 1, unit_price: 0, total: 0 }];

      const validUntil = quote.valid_until
        ? quote.valid_until.split("T")[0]
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

      return {
        client_id: quote.client_id ? String(quote.client_id) : "",
        client_name: quote.client_name || "",
        title: quote.title || "",
        items,
        tax_rate: quote.tax_rate || 20.0,
        valid_until: validUntil,
        subtotal: quote.subtotal || 0,
        tax_amount: quote.tax_amount || 0,
        total: quote.total || 0,
      };
    }

    const defaultValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    return {
      client_id: normalizedDefaultClientId,
      client_name:
        defaultClient?.display_name ||
        defaultClient?.name ||
        "",
      title: "",
      items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
      tax_rate: 20.0,
      valid_until: defaultValidUntil,
      subtotal: 0,
      tax_amount: 0,
      total: 0,
    };
  }, [clients, defaultClientId, quote]);

  const currentInitializationKey = useMemo(() => {
    if (quote && quote.id != null) {
      return `quote-${quote.id}`;
    }
    const normalizedDefaultClientId = defaultClientId
      ? String(defaultClientId)
      : "";
    return `new-${normalizedDefaultClientId}`;
  }, [defaultClientId, quote]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (appliedInitializationKey === currentInitializationKey) {
      return;
    }

    setFormData(buildInitialFormData());
    setErrors({});
    setAppliedInitializationKey(currentInitializationKey);
  }, [
    appliedInitializationKey,
    buildInitialFormData,
    currentInitializationKey,
    isOpen,
  ]);

  useEffect(() => {
    if (!isOpen || quote) {
      return;
    }

    const normalizedDefaultClientId = defaultClientId
      ? String(defaultClientId)
      : "";
    if (!normalizedDefaultClientId) {
      return;
    }

    const defaultClient = clients.find(
      (c) => String(c.id) === normalizedDefaultClientId,
    );
    if (!defaultClient) {
      return;
    }

    const nextClientName =
      defaultClient.display_name || defaultClient.name || "";

    setFormData((prev) => {
      if (
        prev.client_id &&
        prev.client_id !== normalizedDefaultClientId
      ) {
        return prev;
      }

      if (
        prev.client_id === normalizedDefaultClientId &&
        prev.client_name === nextClientName
      ) {
        return prev;
      }

      return {
        ...prev,
        client_id: normalizedDefaultClientId,
        client_name: nextClientName,
      };
    });
  }, [clients, defaultClientId, isOpen, quote]);

  const handleClientChange = (clientId) => {
    const normalizedClientId = clientId ? String(clientId) : "";
    const selectedClient = clients.find(
      (c) => String(c.id) === normalizedClientId,
    );
    const clientName = selectedClient
      ? selectedClient.display_name || selectedClient.name || ""
      : "";
    setFormData((prev) => ({
      ...prev,
      client_id: normalizedClientId,
      client_name: clientName,
    }));
  };

  const calculateTotals = (items, overrideTaxRate) => {
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
    const effectiveTaxRate =
      typeof overrideTaxRate === "number" && !Number.isNaN(overrideTaxRate)
        ? overrideTaxRate
        : formData.tax_rate;
    const tax_amount = subtotal * (effectiveTaxRate / 100);
    const total = subtotal + tax_amount;

    setFormData((prev) => ({
      ...prev,
      subtotal,
      tax_amount,
      total,
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;

    if (field === "quantity" || field === "unit_price") {
      newItems[index].total =
        (parseFloat(newItems[index].quantity) || 0) *
        (parseFloat(newItems[index].unit_price) || 0);
    }

    setFormData((prev) => ({
      ...prev,
      items: newItems,
    }));

    calculateTotals(newItems);
  };

  const addItem = () => {
    const newItems = [
      ...formData.items,
      { description: "", quantity: 1, unit_price: 0, total: 0 },
    ];
    setFormData((prev) => ({
      ...prev,
      items: newItems,
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData((prev) => ({
        ...prev,
        items: newItems,
      }));
      calculateTotals(newItems);
    }
  };

  const handleTaxRateChange = (rate) => {
    const normalizedRate =
      typeof rate === "number" && !Number.isNaN(rate) ? rate : 0;
    setFormData((prev) => ({
      ...prev,
      tax_rate: normalizedRate,
    }));
    calculateTotals(formData.items, normalizedRate);
  };

  const handleSubmit = () => {
    const newErrors = {};

    if (!formData.client_name.trim()) {
      newErrors.client_name = "Le client est obligatoire";
    }

    if (!formData.title.trim()) {
      newErrors.title = "Le titre est obligatoire";
    }

    if (formData.items.length === 0 || !formData.items[0].description.trim()) {
      newErrors.items = "Au moins un élément est obligatoire";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      ...formData,
      valid_until: formData.valid_until + "T23:59:59.999Z",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div
        className="modal-content dark:bg-slate-800 dark:text-slate-100"
        style={{ maxWidth: "800px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <h2 className="modal-header dark:text-slate-100 dark:border-slate-700">
          <span className="flex items-center gap-2">
            {quote ? (
              <>
                <EditIcon aria-hidden="true" className="h-5 w-5" />
                <span>Modifier le devis</span>
              </>
            ) : (
              <>
                <PlusCircleIcon aria-hidden="true" className="h-5 w-5" />
                <span>Nouveau devis</span>
              </>
            )}
          </span>
        </h2>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Client *</label>
            <select
              value={formData.client_id}
              onChange={(e) => handleClientChange(e.target.value)}
              className={`form-input ${errors.client_name ? "error" : ""}`}
              style={{ borderColor: errors.client_name ? "#dc3545" : "" }}
            >
              <option value="">Sélectionner un client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id != null ? String(client.id) : ""}>
                  {client?.display_name ?? client?.name ?? ""}
                </option>
              ))}
            </select>
            {errors.client_name && (
              <div
                style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
              >
                {errors.client_name}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Titre du devis *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              className={`form-input ${errors.title ? "error" : ""}`}
              placeholder="Ex: Prestation développement web"
              style={{ borderColor: errors.title ? "#dc3545" : "" }}
            />
            {errors.title && (
              <div
                style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
              >
                {errors.title}
              </div>
            )}
          </div>
        </div>

        {/* Items Section */}
        <div className="form-group">
          <div className="flex justify-between items-center mb-3">
            <label className="form-label">Éléments du devis</label>
            <button
              type="button"
              onClick={addItem}
              className="btn btn-outline btn-sm"
            >
              + Ajouter une ligne
            </button>
          </div>

          <div className="space-y-3">
            {formData.items.map((item, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg dark:bg-slate-900 dark:text-slate-100">
                <div className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-5">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) =>
                        handleItemChange(index, "description", e.target.value)
                      }
                      className="form-input"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Qté"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          "quantity",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="form-input"
                      min="0"
                      step="0.25"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Prix unitaire"
                      value={item.unit_price}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          "unit_price",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="form-input"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={`${item.total.toFixed(2)}€`}
                      readOnly
                      className="form-input bg-gray-100 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
                    />
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded dark:hover:bg-red-900/40"
                      disabled={formData.items.length === 1}
                      aria-label="Supprimer la ligne"
                    >
                      <TrashIcon aria-hidden="true" className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {errors.items && (
            <div
              style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
            >
              {errors.items}
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Taux TVA (%)</label>
            <select
              value={formData.tax_rate}
              onChange={(e) => handleTaxRateChange(parseFloat(e.target.value))}
              className="form-input"
            >
              <option value={0}>0% (Exonéré)</option>
              <option value={5.5}>5.5% (Réduit)</option>
              <option value={10}>10% (Intermédiaire)</option>
              <option value={20}>20% (Normal)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Valide jusqu'au</label>
            <input
              type="date"
              value={formData.valid_until}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, valid_until: e.target.value }))
              }
              className="form-input"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="bg-gray-50 p-4 rounded-lg dark:bg-slate-900 dark:text-slate-100">
          <div className="space-y-2 text-right">
            <div className="flex justify-between">
              <span>Sous-total:</span>
              <span>{formData.subtotal.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between">
              <span>TVA ({formData.tax_rate}%):</span>
              <span>{formData.tax_amount.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formData.total.toFixed(2)}€</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-outline">
            Annuler
          </button>
          <button onClick={handleSubmit} className="btn btn-primary">
            {quote ? "Modifier" : "Créer le devis"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Quotes Module - Complete Implementation
const QUOTES_CACHE_TTL = 60 * 1000; // 1 minute cache to keep navigation snappy
let quotesCache = null;
let quotesCacheTimestamp = 0;
const getFreshQuotesCache = () => {
  if (quotesCache && Date.now() - quotesCacheTimestamp < QUOTES_CACHE_TTL) {
    return quotesCache;
  }
  return null;
};
const getInitialQuotesState = () => {
  const freshCache = getFreshQuotesCache();
  if (freshCache) {
    return {
      quotes: freshCache.quotes ?? [],
      clients: freshCache.clients ?? [],
      loading: false,
    };
  }
  const storedCache = readCacheFromStorage(
    CACHE_STORAGE_KEYS.quotes,
    QUOTES_CACHE_TTL,
  );
  if (storedCache?.data) {
    quotesCache = storedCache.data;
    quotesCacheTimestamp = storedCache.timestamp;
    return {
      quotes: storedCache.data.quotes ?? [],
      clients: storedCache.data.clients ?? [],
      loading: false,
    };
  }
  return { quotes: [], clients: [], loading: true };
};
const Quotes = ({
  user,
  clientId,
  onRegisterCreateHandler,
  renderDocumentActions,
}) => {
  const initialQuotesState = useMemo(() => getInitialQuotesState(), []);
  const [quotes, setQuotes] = useState(() => initialQuotesState.quotes);
  const [clients, setClients] = useState(() => initialQuotesState.clients);
  const [loading, setLoading] = useState(initialQuotesState.loading);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);
  const [quoteTemplates, setQuoteTemplates] = useState([]);
  const [pendingClientId, setPendingClientId] = useState('');

  const clientEmailMap = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      if (client?.id != null) {
        map.set(String(client.id), client);
      }
    });
    return map;
  }, [clients]);

  const apiCall = useCallback(async (url, options = {}) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    if (!user) {
      console.error("[apiCall] utilisateur non connecté"); // ✅ CHECKED auth
      try {
        return await api({ url, ...options });
      } catch (err) {
        console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
        throw err;
      }
    }

    let token;
    try {
      token = await user.getIdToken(); // ✅ FIXED token/projectId/trace
    } catch (err) {
      console.error("[apiCall] impossible d'obtenir le token:", err); // ✅ FIXED token/projectId/trace
      throw err;
    }
    try {
      return await api({
        url,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(user?.uid ? { "X-User-Id": user.uid } : {}),
          ...options.headers,
        },
        ...options,
      });
    } catch (err) {
      console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
      throw err;
    }
  }, []);

  const persistQuotesCache = useCallback(
    (nextQuotes, nextClients = clients) => {
      const cachePayload = { quotes: nextQuotes, clients: nextClients };
      quotesCache = cachePayload;
      const persistedAt =
        persistCacheToStorage(CACHE_STORAGE_KEYS.quotes, cachePayload) ??
        Date.now();
      quotesCacheTimestamp = persistedAt;
    },
    [clients],
  );

  const loadQuotes = useCallback(async () => {
    if (
      !getFreshQuotesCache() &&
      (!quotesCache || (Array.isArray(quotesCache.quotes) && quotesCache.quotes.length === 0))
    ) {
      setLoading(true);
    }
    try {
      const [quotesResponse, clientsResponse] = await Promise.all([
        apiCall("/quotes"),
        apiCall("/clients"),
      ]);
      const nextQuotes = extractArrayData(quotesResponse, "quotes");
      const nextClients = extractArrayData(clientsResponse, "clients");
      setQuotes(nextQuotes);
      setClients(nextClients);
      persistQuotesCache(nextQuotes, nextClients);
    } catch (error) {
      console.error("Error loading quotes:", error);
    } finally {
      setLoading(false);
    }
  }, [apiCall, persistQuotesCache]);

  const openQuoteCreation = useCallback(
    ({ clientId: requestedClientId } = {}) => {
      const normalizedRequestedId = requestedClientId
        ? String(requestedClientId)
        : '';
      const fallbackClientId = clientId ? String(clientId) : '';
      const resolvedClientId = normalizedRequestedId || fallbackClientId;

      setPendingClientId(resolvedClientId);
      setEditingQuote(null);
      setShowQuoteModal(true);
    },
    [clientId],
  );

  const handleEditQuote = (quote) => {
    setEditingQuote(quote);
    setPendingClientId('');
    setShowQuoteModal(true);
  };

  const handleCloseQuoteModal = useCallback(() => {
    setShowQuoteModal(false);
    setEditingQuote(null);
    setPendingClientId('');
  }, []);

  const handleSaveQuote = async (quoteData) => {
    try {
      if (editingQuote) {
        await apiCall(`/quotes/${editingQuote.id}`, {
          method: "PUT",
          data: quoteData,
        });
        console.log(`Élément enregistré avec succès (ID: ${editingQuote.id})`);
        showToast(`Élément enregistré avec succès (ID: ${editingQuote.id})`);
        setQuotes((prevQuotes) => {
          const nextQuotes = prevQuotes.map((q) =>
            q.id === editingQuote.id ? { ...q, ...quoteData } : q,
          );
          persistQuotesCache(nextQuotes);
          return nextQuotes;
        });
      } else {
        const response = await apiCall("/quotes", {
          method: "POST",
          data: quoteData,
        });
        console.log(`Élément enregistré avec succès (ID: ${response.data.id})`);
        showToast(`Élément enregistré avec succès (ID: ${response.data.id})`);
        setQuotes((prevQuotes) => {
          const nextQuotes = [response.data, ...prevQuotes];
          persistQuotesCache(nextQuotes);
          return nextQuotes;
        });
      }
      setShowQuoteModal(false);
      setPendingClientId('');
    } catch (error) {
      console.error("Error saving quote:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
    }
  };

  const updateQuoteStatus = async (quoteId, status) => {
    try {
      await apiCall(`/quotes/${quoteId}/status`, {
        method: "PUT",
        data: { status },
      });
      setQuotes((prevQuotes) => {
        const nextQuotes = prevQuotes.map((q) =>
          q.id === quoteId ? { ...q, status } : q,
        );
        persistQuotesCache(nextQuotes);
        return nextQuotes;
      });
    } catch (error) {
      console.error("Error updating quote status:", error);
    }
  };

  const handleDeleteQuote = async (quoteId) => {
    if (!window.confirm("Supprimer ce devis ? Cette action est définitive.")) {
      return;
    }
    try {
      await apiCall(`/quotes/${quoteId}`, {
        method: "DELETE",
      });
      const normalizedId = normalizeId(quoteId);
      setQuotes((prevQuotes) => {
        const nextQuotes = prevQuotes.filter(
          (q) => normalizeId(q.id) !== normalizedId,
        );
        persistQuotesCache(nextQuotes);
        return nextQuotes;
      });
      showToast("Devis supprimé avec succès");
    } catch (error) {
      console.error("Error deleting quote:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
    }
  };

  const convertToInvoice = async (quote) => {
    try {
      const invoiceData = {
        quote_id: quote.id,
        client_id: quote.client_id,
        client_name: quote.client_name,
        title: quote.title,
        items: quote.items,
        tax_rate: quote.tax_rate,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await apiCall("/invoices", {
        method: "POST",
        data: invoiceData,
      });

      // Update quote status to accepted
      await updateQuoteStatus(quote.id, "accepted");

      alert("Facture créée avec succès !");
    } catch (error) {
      console.error("Error converting to invoice:", error);
      alert("Erreur lors de la création de la facture");
    }
  };

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    if (typeof onRegisterCreateHandler !== 'function') {
      return undefined;
    }

    const handler = ({ clientId: requestedClientId } = {}) => {
      openQuoteCreation({ clientId: requestedClientId });
    };

    onRegisterCreateHandler(handler);

    return () => {
      onRegisterCreateHandler(null);
    };
  }, [onRegisterCreateHandler, openQuoteCreation]);

  const getStatusColor = (status) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-700";
      case "sent":
        return "bg-blue-100 text-blue-700";
      case "accepted":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "draft":
        return "Brouillon";
      case "sent":
        return "Envoyé";
      case "accepted":
        return "Accepté";
      case "rejected":
        return "Refusé";
      default:
        return status;
    }
  };

  const quoteStats = useMemo(
    () =>
      quotes.reduce(
        (acc, quote) => {
          switch (quote?.status) {
            case "draft":
              acc.draft += 1;
              break;
            case "sent":
              acc.sent += 1;
              break;
            case "accepted":
              acc.accepted += 1;
              break;
            case "rejected":
              acc.rejected += 1;
              break;
            default:
              break;
          }
          return acc;
        },
        { draft: 0, sent: 0, accepted: 0, rejected: 0 },
      ),
    [quotes],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des devis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800 dark:text-slate-100">
            <DocumentIcon aria-hidden="true" className="h-6 w-6" />
            <span>Devis</span>
          </h1>
          <p className="text-gray-600 mt-1 dark:text-slate-400">
            Gérez vos devis et propositions commerciales
          </p>
        </div>
        <button onClick={() => openQuoteCreation()} className="btn btn-primary">
          + Nouveau devis
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-gray-700 dark:text-slate-100">
            {quoteStats.draft}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">Brouillons</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-blue-600">
            {quoteStats.sent}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">Envoyés</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-green-600">
            {quoteStats.accepted}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">Acceptés</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-red-600">
            {quoteStats.rejected}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">Refusés</div>
        </div>
      </div>

      {/* Quotes List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
        {quotes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-4 flex justify-center">
              <DocumentIcon
                aria-hidden="true"
                className="h-16 w-16 text-slate-300 dark:text-slate-600"
              />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2 dark:text-slate-100">
              Aucun devis
            </h3>
            <p className="text-gray-500 mb-4 dark:text-slate-400">
              Commencez par créer votre premier devis !
            </p>
            <button onClick={() => openQuoteCreation()} className="btn btn-primary">
              Créer un devis
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-700">
            {quotes.map((quote) => {
              const normalizedClientId =
                quote?.client_id != null ? String(quote.client_id) : '';
              const clientEntry =
                normalizedClientId && clientEmailMap.has(normalizedClientId)
                  ? clientEmailMap.get(normalizedClientId)
                  : null;
              const defaultEmail = clientEntry?.email || '';
              const customActions =
                typeof renderDocumentActions === 'function'
                  ? renderDocumentActions({
                      document: quote,
                      defaultEmail,
                      client: clientEntry,
                    })
                  : null;

              return (
                <div
                  key={quote.id}
                  className="p-6 transition-all hover:bg-gray-50 dark:hover:bg-slate-700/60"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center space-x-3">
                        <h3 className="font-semibold text-gray-800 dark:text-slate-100">
                          {quote.quote_number}
                        </h3>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            quote.status,
                          )}`}
                        >
                          {getStatusText(quote.status)}
                        </span>
                      </div>
                      <p className="text-gray-900 font-medium dark:text-slate-100">{quote.title}</p>
                      <p className="text-gray-600 text-sm dark:text-slate-400">
                        Client: {quote?.client_name ?? ''}
                      </p>
                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-2">
                          <MoneyIcon aria-hidden="true" className="h-4 w-4" />
                          {formatCurrency(quote.total)}
                        </span>
                        <span className="flex items-center gap-2">
                          <CalendarIcon aria-hidden="true" className="h-4 w-4" />
                          {formatDate(quote.created_at)}
                        </span>
                        <span className="flex items-center gap-2">
                          <ClockIcon aria-hidden="true" className="h-4 w-4" />
                          Valide jusqu'au {formatDate(quote.valid_until)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      {customActions && (
                        <div className="flex items-center justify-end">{customActions}</div>
                      )}
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditQuote(quote)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                          title="Modifier"
                          aria-label="Modifier"
                          type="button"
                        >
                          <EditIcon aria-hidden="true" className="h-5 w-5" />
                        </button>
                        {quote.status === 'sent' && (
                          <>
                            <button
                              onClick={() => updateQuoteStatus(quote.id, 'accepted')}
                              className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                              title="Marquer comme accepté"
                              aria-label="Marquer comme accepté"
                              type="button"
                            >
                              <CheckCircleIcon aria-hidden="true" className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => updateQuoteStatus(quote.id, 'rejected')}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                              title="Marquer comme refusé"
                              aria-label="Marquer comme refusé"
                              type="button"
                            >
                              <CrossCircleIcon aria-hidden="true" className="h-5 w-5" />
                            </button>
                          </>
                        )}
                        {quote.status === 'accepted' && (
                          <button
                            onClick={() => convertToInvoice(quote)}
                            className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                            title="Convertir en facture"
                            aria-label="Convertir en facture"
                            type="button"
                          >
                            <ReceiptIcon aria-hidden="true" className="h-5 w-5" />
                          </button>
                        )}
                        {(quote.status === 'draft' || quote.status === 'sent') && (
                          <button
                            onClick={() => updateQuoteStatus(quote.id, 'sent')}
                            className="btn btn-outline btn-sm"
                            disabled={quote.status === 'sent'}
                          >
                            {quote.status === 'sent' ? 'Envoyé' : 'Envoyer'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteQuote(quote.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                          title="Supprimer"
                          aria-label="Supprimer"
                          type="button"
                        >
                          <TrashIcon aria-hidden="true" className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        )}
      </div>

      {/* Quote Modal */}
      {showQuoteModal && (
        <QuoteModal
          isOpen={showQuoteModal}
          onClose={handleCloseQuoteModal}
          onSave={handleSaveQuote}
          quote={editingQuote}
          clients={clients}
          defaultClientId={pendingClientId}
        />
      )}
    </div>
  );
};

// Invoice Modal Component - Modular Invoice Creation/Edition
const InvoiceModal = ({
  isOpen,
  onClose,
  onSave,
  invoice,
  clients,
  quotes,
  defaultClientId,
  prefillSeed,
}) => {
  const [formData, setFormData] = useState({
    quote_id: "",
    client_id: "",
    client_name: "",
    title: "",
    items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
    tax_rate: 20.0,
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    subtotal: 0,
    tax_amount: 0,
    total: 0,
  });

  const [errors, setErrors] = useState({});
  const [appliedInitializationKey, setAppliedInitializationKey] = useState(
    null,
  );

  const buildPrefilledItems = useCallback(
    (seed, taxRateValue) => {
      if (!seed) {
        return { items: [], subtotal: 0 };
      }
      const tasks = Array.isArray(seed.tasks) ? seed.tasks : [];
      const normalizedTasks = tasks
        .map((task) => {
          const price = Number(task?.price);
          if (!Number.isFinite(price) || price <= 0) {
            return null;
          }
          return {
            description:
              typeof task?.label === 'string' && task.label.trim()
                ? `Tâche — ${task.label.trim()}`
                : 'Tâche spécifique',
            quantity: 1,
            unit_price: Math.round(price * 100) / 100,
            total: Math.round(price * 100) / 100,
          };
        })
        .filter(Boolean);

      const tasksTotal = normalizedTasks.reduce(
        (sum, item) => sum + (Number(item.total) || 0),
        0,
      );
      const totalAmount = Number(seed.totalAmount) || 0;
      const servicesAmount = Number.isFinite(seed.servicesAmount)
        ? seed.servicesAmount
        : Math.max(0, totalAmount - tasksTotal);
      const sanitizedServices = Math.round(servicesAmount * 100) / 100;
      const totalHours = Number(seed.totalHours) || 0;
      const items = [...normalizedTasks];

      if (sanitizedServices > 0) {
        const safeHours = totalHours > 0 ? Number(totalHours.toFixed(2)) : 1;
        const unitPrice = safeHours > 0
          ? Math.round((sanitizedServices / safeHours) * 100) / 100
          : sanitizedServices;
        const description = seed.periodLabel
          ? `Prestations — ${seed.periodLabel}`
          : 'Prestations réalisées';
        items.unshift({
          description,
          quantity: safeHours,
          unit_price: unitPrice,
          total: sanitizedServices,
        });
      }

      const subtotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
      return {
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        tax_amount: Math.round(((Math.round(subtotal * 100) / 100) * (taxRateValue / 100)) * 100) / 100,
      };
    }, []);

  const buildInitialFormData = useCallback(() => {
    const normalizedDefaultClientId = defaultClientId
      ? String(defaultClientId)
      : "";
    const defaultClient = normalizedDefaultClientId
      ? clients.find((c) => String(c.id) === normalizedDefaultClientId)
      : null;

    if (invoice) {
      const items = Array.isArray(invoice.items)
        ? invoice.items.map((item) => ({
            description: item?.description || "",
            quantity:
              item?.quantity != null ? Number(item.quantity) : 1,
            unit_price:
              item?.unit_price != null ? Number(item.unit_price) : 0,
            total: item?.total != null ? Number(item.total) : 0,
          }))
        : [{ description: "", quantity: 1, unit_price: 0, total: 0 }];

      const dueDate = invoice.due_date
        ? invoice.due_date.split("T")[0]
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

      return {
        quote_id: invoice.quote_id ? String(invoice.quote_id) : "",
        client_id: invoice.client_id ? String(invoice.client_id) : "",
        client_name: invoice.client_name || "",
        title: invoice.title || "",
        items,
        tax_rate: invoice.tax_rate || 20.0,
        due_date: dueDate,
        subtotal: invoice.subtotal || 0,
        tax_amount: invoice.tax_amount || 0,
        total: invoice.total || 0,
      };
    }

    const defaultDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const baseFormData = {
      quote_id: "",
      client_id: normalizedDefaultClientId,
      client_name:
        defaultClient?.display_name ||
        defaultClient?.name ||
        "",
      title: "",
      items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
      tax_rate: 20.0,
      due_date: defaultDueDate,
      subtotal: 0,
      tax_amount: 0,
      total: 0,
    };

    if (
      prefillSeed &&
      (!prefillSeed.clientId ||
        !normalizedDefaultClientId ||
        String(prefillSeed.clientId) === normalizedDefaultClientId)
    ) {
      const prefilled = buildPrefilledItems(
        prefillSeed,
        baseFormData.tax_rate || 0,
      );
      if (prefilled.items.length > 0) {
        const subtotalValue = Math.round(prefilled.subtotal * 100) / 100;
        const taxAmount = Math.round(subtotalValue * (baseFormData.tax_rate / 100) * 100) / 100;
        const totalValue = Math.round((subtotalValue + taxAmount) * 100) / 100;
        const inferredTitle = prefillSeed.periodLabel
          ? `Facture ${
              prefillSeed.clientLabel ? prefillSeed.clientLabel.trim() : ''
            } — ${prefillSeed.periodLabel}`.trim()
          : baseFormData.title;
        return {
          ...baseFormData,
          client_name:
            prefillSeed.clientLabel?.trim() || baseFormData.client_name,
          title: inferredTitle || baseFormData.title,
          items: prefilled.items,
          subtotal: subtotalValue,
          tax_amount: taxAmount,
          total: totalValue,
        };
      }
      return {
        ...baseFormData,
        client_name:
          prefillSeed.clientLabel?.trim() || baseFormData.client_name,
      };
    }

    return baseFormData;
  }, [
    clients,
    defaultClientId,
    invoice,
    prefillSeed,
    buildPrefilledItems,
  ]);

  const currentInitializationKey = useMemo(() => {
    if (invoice && invoice.id != null) {
      return `invoice-${invoice.id}`;
    }
    const normalizedDefaultClientId = defaultClientId
      ? String(defaultClientId)
      : "";
    const seedKey = prefillSeed?.clientId
      ? `${prefillSeed.clientId}:${prefillSeed.savedAt || "seed"}`
      : "no-seed";
    return `new-${normalizedDefaultClientId}-${seedKey}`;
  }, [defaultClientId, invoice, prefillSeed]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (appliedInitializationKey === currentInitializationKey) {
      return;
    }

    setFormData(buildInitialFormData());
    setErrors({});
    setAppliedInitializationKey(currentInitializationKey);
  }, [
    appliedInitializationKey,
    buildInitialFormData,
    currentInitializationKey,
    isOpen,
  ]);

  useEffect(() => {
    if (!isOpen || invoice) {
      return;
    }

    const normalizedDefaultClientId = defaultClientId
      ? String(defaultClientId)
      : "";
    if (!normalizedDefaultClientId) {
      return;
    }

    const defaultClient = clients.find(
      (c) => String(c.id) === normalizedDefaultClientId,
    );
    if (!defaultClient) {
      return;
    }

    const nextClientName =
      defaultClient.display_name || defaultClient.name || "";

    setFormData((prev) => {
      if (
        prev.client_id &&
        prev.client_id !== normalizedDefaultClientId
      ) {
        return prev;
      }

      if (
        prev.client_id === normalizedDefaultClientId &&
        prev.client_name === nextClientName
      ) {
        return prev;
      }

      return {
        ...prev,
        client_id: normalizedDefaultClientId,
        client_name: nextClientName,
      };
    });
  }, [clients, defaultClientId, invoice, isOpen]);

  const handleQuoteSelection = (quoteId) => {
    const normalizedQuoteId = quoteId ? String(quoteId) : "";
    const selectedQuote = quotes.find((q) => String(q.id) === normalizedQuoteId);
    if (selectedQuote) {
      setFormData((prev) => ({
        ...prev,
        quote_id: normalizedQuoteId,
        client_id: selectedQuote.client_id
          ? String(selectedQuote.client_id)
          : "",
        client_name: selectedQuote.client_name,
        title: selectedQuote.title,
        items: selectedQuote.items,
        tax_rate: selectedQuote.tax_rate,
        subtotal: selectedQuote.subtotal,
        tax_amount: selectedQuote.tax_amount,
        total: selectedQuote.total,
      }));
    }
  };

  const handleClientChange = (clientId) => {
    const normalizedClientId = clientId ? String(clientId) : "";
    const selectedClient = clients.find(
      (c) => String(c.id) === normalizedClientId,
    );
    const clientName = selectedClient
      ? selectedClient.display_name || selectedClient.name || ""
      : "";
    setFormData((prev) => ({
      ...prev,
      client_id: normalizedClientId,
      client_name: clientName,
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;

    if (field === "quantity" || field === "unit_price") {
      newItems[index].total =
        (parseFloat(newItems[index].quantity) || 0) *
        (parseFloat(newItems[index].unit_price) || 0);
    }

    setFormData((prev) => ({
      ...prev,
      items: newItems,
    }));

    calculateTotals(newItems);
  };

  const calculateTotals = (items, overrideTaxRate) => {
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
    const effectiveTaxRate =
      typeof overrideTaxRate === "number" && !Number.isNaN(overrideTaxRate)
        ? overrideTaxRate
        : formData.tax_rate;
    const tax_amount = subtotal * (effectiveTaxRate / 100);
    const total = subtotal + tax_amount;

    setFormData((prev) => ({
      ...prev,
      subtotal,
      tax_amount,
      total,
    }));
  };

  const addItem = () => {
    const newItems = [
      ...formData.items,
      { description: "", quantity: 1, unit_price: 0, total: 0 },
    ];
    setFormData((prev) => ({
      ...prev,
      items: newItems,
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData((prev) => ({
        ...prev,
        items: newItems,
      }));
      calculateTotals(newItems);
    }
  };

  const handleTaxRateChange = (taxRate) => {
    const normalizedRate =
      typeof taxRate === "number" && !Number.isNaN(taxRate) ? taxRate : 0;
    setFormData((prev) => ({
      ...prev,
      tax_rate: normalizedRate,
    }));
    calculateTotals(formData.items, normalizedRate);
  };

  const handleSubmit = () => {
    const newErrors = {};

    if (!formData.client_name.trim()) {
      newErrors.client_name = "Le client est obligatoire";
    }

    if (!formData.title.trim()) {
      newErrors.title = "Le titre est obligatoire";
    }

    if (formData.items.length === 0 || !formData.items[0].description.trim()) {
      newErrors.items = "Au moins un élément est obligatoire";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      ...formData,
      due_date: formData.due_date + "T23:59:59.999Z",
    });
  };

  const acceptedQuotes = quotes.filter((q) => q.status === "accepted");

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div
        className="modal-content dark:bg-slate-800 dark:text-slate-100"
        style={{ maxWidth: "800px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <h2 className="modal-header dark:text-slate-100 dark:border-slate-700">
          <span className="flex items-center gap-2">
            {invoice ? (
              <>
                <EditIcon aria-hidden="true" className="h-5 w-5" />
                <span>Modifier la facture</span>
              </>
            ) : (
              <>
                <PlusCircleIcon aria-hidden="true" className="h-5 w-5" />
                <span>Nouvelle facture</span>
              </>
            )}
          </span>
        </h2>

        {/* Quote to Invoice Conversion */}
        {!invoice && acceptedQuotes.length > 0 && (
          <div className="form-group">
            <label className="form-label">Convertir depuis un devis</label>
            <select
              value={formData.quote_id}
              onChange={(e) => handleQuoteSelection(e.target.value)}
              className="form-input"
            >
              <option value="">Créer une nouvelle facture</option>
              {acceptedQuotes.map((quote) => (
                <option
                  key={quote.id}
                  value={quote.id != null ? String(quote.id) : ""}
                >
                  {quote.quote_number} - {quote?.client_name ?? ""} -{" "}
                  {formatCurrency(quote.total)}
                </option>
              ))}
            </select>
            <div className="text-sm text-gray-500 mt-1 dark:text-slate-400">
              Sélectionnez un devis accepté pour créer automatiquement une
              facture
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Client *</label>
            <select
              value={formData.client_id}
              onChange={(e) => handleClientChange(e.target.value)}
              className={`form-input ${errors.client_name ? "error" : ""}`}
              disabled={!!formData.quote_id}
              style={{ borderColor: errors.client_name ? "#dc3545" : "" }}
            >
              <option value="">Sélectionner un client</option>
              {clients.map((client) => (
                <option
                  key={client.id}
                  value={client.id != null ? String(client.id) : ""}
                >
                  {client?.display_name ?? client?.name ?? ""}
                </option>
              ))}
            </select>
            {errors.client_name && (
              <div
                style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
              >
                {errors.client_name}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Titre de la facture *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              className={`form-input ${errors.title ? "error" : ""}`}
              placeholder="Ex: Prestation développement web"
              style={{ borderColor: errors.title ? "#dc3545" : "" }}
            />
            {errors.title && (
              <div
                style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
              >
                {errors.title}
              </div>
            )}
          </div>
        </div>

        {/* Items Section */}
        <div className="form-group">
          <div className="flex justify-between items-center mb-3">
            <label className="form-label">Éléments de la facture</label>
            <button
              type="button"
              onClick={addItem}
              className="btn btn-outline btn-sm"
            >
              + Ajouter une ligne
            </button>
          </div>

          <div className="space-y-3">
            {formData.items.map((item, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg dark:bg-slate-900 dark:text-slate-100">
                <div className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-5">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) =>
                        handleItemChange(index, "description", e.target.value)
                      }
                      className="form-input"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Qté"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          "quantity",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="form-input"
                      min="0"
                      step="0.25"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Prix unitaire"
                      value={item.unit_price}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          "unit_price",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="form-input"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={`${item.total.toFixed(2)}€`}
                      readOnly
                      className="form-input bg-gray-100 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
                    />
                  </div>
                  <div className="col-span-1">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded dark:hover:bg-red-900/40"
                      disabled={formData.items.length === 1}
                      aria-label="Supprimer la ligne"
                    >
                      <TrashIcon aria-hidden="true" className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {errors.items && (
            <div
              style={{ color: "#dc3545", fontSize: "12px", marginTop: "4px" }}
            >
              {errors.items}
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Taux TVA (%)</label>
            <select
              value={formData.tax_rate}
              onChange={(e) => handleTaxRateChange(parseFloat(e.target.value))}
              className="form-input"
            >
              <option value={0}>0% (Exonéré)</option>
              <option value={5.5}>5.5% (Réduit)</option>
              <option value={10}>10% (Intermédiaire)</option>
              <option value={20}>20% (Normal)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Date d'échéance</label>
            <input
              type="date"
              value={formData.due_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, due_date: e.target.value }))
              }
              className="form-input"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="bg-gray-50 p-4 rounded-lg dark:bg-slate-900 dark:text-slate-100">
          <div className="space-y-2 text-right">
            <div className="flex justify-between">
              <span>Sous-total:</span>
              <span>{formData.subtotal.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between">
              <span>TVA ({formData.tax_rate}%):</span>
              <span>{formData.tax_amount.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formData.total.toFixed(2)}€</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-outline">
            Annuler
          </button>
          <button onClick={handleSubmit} className="btn btn-primary">
            {invoice ? "Modifier" : "Créer la facture"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Invoices Module - Complete Implementation
const INVOICES_CACHE_TTL = 60 * 1000;
let invoicesCache = null;
let invoicesCacheTimestamp = 0;
const getFreshInvoicesCache = () => {
  if (
    invoicesCache &&
    Date.now() - invoicesCacheTimestamp < INVOICES_CACHE_TTL
  ) {
    return invoicesCache;
  }
  return null;
};
const getInitialInvoicesState = () => {
  const freshCache = getFreshInvoicesCache();
  if (freshCache) {
    return {
      invoices: freshCache.invoices ?? [],
      clients: freshCache.clients ?? [],
      quotes: freshCache.quotes ?? [],
      loading: false,
    };
  }
  const storedCache = readCacheFromStorage(
    CACHE_STORAGE_KEYS.invoices,
    INVOICES_CACHE_TTL,
  );
  if (storedCache?.data) {
    invoicesCache = storedCache.data;
    invoicesCacheTimestamp = storedCache.timestamp;
    return {
      invoices: storedCache.data.invoices ?? [],
      clients: storedCache.data.clients ?? [],
      quotes: storedCache.data.quotes ?? [],
      loading: false,
    };
  }
  return { invoices: [], clients: [], quotes: [], loading: true };
};
const Invoices = ({
  user,
  clientId,
  onRegisterCreateHandler,
  renderDocumentActions,
}) => {
  const initialInvoicesState = useMemo(() => getInitialInvoicesState(), []);
  const [invoices, setInvoices] = useState(() => initialInvoicesState.invoices);
  const [clients, setClients] = useState(() => initialInvoicesState.clients);
  const [quotes, setQuotes] = useState(() => initialInvoicesState.quotes);
  const [loading, setLoading] = useState(initialInvoicesState.loading);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [pendingClientId, setPendingClientId] = useState('');
  const [invoiceSeed, setInvoiceSeed] = useState(null);

  const clientEmailMap = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      if (client?.id != null) {
        map.set(String(client.id), client);
      }
    });
    return map;
  }, [clients]);

  const apiCall = useCallback(async (url, options = {}) => {
    // ✅ FIXED for production
    const user = getAuth().currentUser;
    if (!user) {
      console.error("[apiCall] utilisateur non connecté"); // ✅ CHECKED auth
      try {
        return await api({ url, ...options });
      } catch (err) {
        console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
        throw err;
      }
    }

    let token;
    try {
      token = await user.getIdToken(); // ✅ FIXED token/projectId/trace
    } catch (err) {
      console.error("[apiCall] impossible d'obtenir le token:", err); // ✅ FIXED token/projectId/trace
      throw err;
    }
    try {
      return await api({
        url,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(user?.uid ? { "X-User-Id": user.uid } : {}),
          ...options.headers,
        },
        ...options,
      });
    } catch (err) {
      console.error(`[apiCall] échec appel ${url}:`, err); // ✅ FIXED token/projectId/trace
      throw err;
    }
  }, []);

  const persistInvoicesCache = useCallback(
    (nextInvoices, nextClients = clients, nextQuotes = quotes) => {
      const cachePayload = {
        invoices: nextInvoices,
        clients: nextClients,
        quotes: nextQuotes,
      };
      invoicesCache = cachePayload;
      const persistedAt =
        persistCacheToStorage(CACHE_STORAGE_KEYS.invoices, cachePayload) ??
        Date.now();
      invoicesCacheTimestamp = persistedAt;
    },
    [clients, quotes],
  );

  const loadInvoices = useCallback(async () => {
    if (
      !getFreshInvoicesCache() &&
      (!invoicesCache ||
        (Array.isArray(invoicesCache.invoices) &&
          invoicesCache.invoices.length === 0))
    ) {
      setLoading(true);
    }
    try {
      const [invoicesResponse, clientsResponse, quotesResponse] =
        await Promise.all([
          apiCall("/invoices"),
          apiCall("/clients"),
          apiCall("/quotes"),
        ]);
      const nextInvoices = extractArrayData(invoicesResponse, "invoices");
      const nextClients = extractArrayData(clientsResponse, "clients");
      const nextQuotes = extractArrayData(quotesResponse, "quotes");
      setInvoices(nextInvoices);
      setClients(nextClients);
      setQuotes(nextQuotes);
      persistInvoicesCache(nextInvoices, nextClients, nextQuotes);
    } catch (error) {
      console.error("Error loading invoices:", error);
    } finally {
      setLoading(false);
    }
  }, [apiCall, persistInvoicesCache]);

  const openInvoiceCreation = useCallback(
    ({ clientId: requestedClientId } = {}) => {
      const normalizedRequestedId = requestedClientId
        ? String(requestedClientId)
        : '';
      const fallbackClientId = clientId ? String(clientId) : '';
      const resolvedClientId = normalizedRequestedId || fallbackClientId;

      setPendingClientId(resolvedClientId);
      setEditingInvoice(null);
      const seed = consumeInvoiceSeed(resolvedClientId);
      setInvoiceSeed(seed || null);
      setShowInvoiceModal(true);
    },
    [clientId],
  );

  const handleEditInvoice = (invoice) => {
    setEditingInvoice(invoice);
    setPendingClientId('');
    setInvoiceSeed(null);
    setShowInvoiceModal(true);
  };

  const handleCloseInvoiceModal = useCallback(() => {
    setShowInvoiceModal(false);
    setEditingInvoice(null);
    setPendingClientId('');
    setInvoiceSeed(null);
  }, []);

  const handleSaveInvoice = async (invoiceData) => {
    try {
      if (editingInvoice) {
        await apiCall(`/invoices/${editingInvoice.id}`, {
          method: "PUT",
          data: invoiceData,
        });
        console.log(
          `Élément enregistré avec succès (ID: ${editingInvoice.id})`,
        );
        showToast(`Élément enregistré avec succès (ID: ${editingInvoice.id})`);
        setInvoices((prevInvoices) => {
          const nextInvoices = prevInvoices.map((i) =>
            i.id === editingInvoice.id ? { ...i, ...invoiceData } : i,
          );
          persistInvoicesCache(nextInvoices);
          return nextInvoices;
        });
      } else {
        const response = await apiCall("/invoices", {
          method: "POST",
          data: invoiceData,
        });
        console.log(`Élément enregistré avec succès (ID: ${response.data.id})`);
        showToast(`Élément enregistré avec succès (ID: ${response.data.id})`);
        setInvoices((prevInvoices) => {
          const nextInvoices = [response.data, ...prevInvoices];
          persistInvoicesCache(nextInvoices);
          return nextInvoices;
        });
      }
      setShowInvoiceModal(false);
      setPendingClientId('');
      setInvoiceSeed(null);
    } catch (error) {
      console.error("Error saving invoice:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
    }
  };

  const updateInvoiceStatus = async (invoiceId, status) => {
    try {
      await apiCall(`/invoices/${invoiceId}/status`, {
        method: "PUT",
        data: { status },
      });
      setInvoices((prevInvoices) => {
        const nextInvoices = prevInvoices.map((i) =>
          i.id === invoiceId ? { ...i, status } : i,
        );
        persistInvoicesCache(nextInvoices);
        return nextInvoices;
      });
    } catch (error) {
      console.error("Error updating invoice status:", error);
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (
      !window.confirm("Supprimer cette facture ? Cette action est définitive.")
    ) {
      return;
    }
    try {
      await apiCall(`/invoices/${invoiceId}`, {
        method: "DELETE",
      });
      const normalizedId = normalizeId(invoiceId);
      setInvoices((prevInvoices) => {
        const nextInvoices = prevInvoices.filter(
          (i) => normalizeId(i.id) !== normalizedId,
        );
        persistInvoicesCache(nextInvoices);
        return nextInvoices;
      });
      showToast("Facture supprimée avec succès");
    } catch (error) {
      console.error("Error deleting invoice:", error);
      showToast(
        `Erreur: ${error.response?.data?.detail || error.message}`,
        true,
      );
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (typeof onRegisterCreateHandler !== 'function') {
      return undefined;
    }

    const handler = ({ clientId: requestedClientId } = {}) => {
      openInvoiceCreation({ clientId: requestedClientId });
    };

    onRegisterCreateHandler(handler);

    return () => {
      onRegisterCreateHandler(null);
    };
  }, [onRegisterCreateHandler, openInvoiceCreation]);

  const getStatusColor = (status) => {
    switch (status) {
      case "sent":
        return "bg-blue-100 text-blue-700";
      case "paid":
        return "bg-green-100 text-green-700";
      case "overdue":
        return "bg-red-100 text-red-700";
      case "cancelled":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "sent":
        return "Envoyée";
      case "paid":
        return "Payée";
      case "overdue":
        return "En retard";
      case "cancelled":
        return "Annulée";
      default:
        return status;
    }
  };

  const invoiceStats = useMemo(() => {
    const stats = {
      totalPaid: 0,
      totalUnpaid: 0,
      overdueCount: 0,
      total: invoices.length,
      overdueIds: new Set(),
    };
    const now = Date.now();
    invoices.forEach((invoice) => {
      const status = invoice?.status;
      const amount = Number(invoice?.total) || 0;
      if (status === "paid") {
        stats.totalPaid += amount;
      } else if (status === "sent" || status === "overdue") {
        stats.totalUnpaid += amount;
      }
      const dueDate = invoice?.due_date
        ? new Date(invoice.due_date).getTime()
        : NaN;
      if (!Number.isNaN(dueDate) && dueDate < now && status !== "paid") {
        stats.overdueCount += 1;
        stats.overdueIds.add(normalizeId(invoice?.id));
      }
    });
    return stats;
  }, [invoices]);

  const isOverdue = (invoice) =>
    invoiceStats.overdueIds.has(normalizeId(invoice?.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des factures...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800 dark:text-slate-100">
            <ReceiptIcon aria-hidden="true" className="h-6 w-6" />
            <span>Factures</span>
          </h1>
          <p className="text-gray-600 mt-1 dark:text-slate-400">
            Gérez vos factures et suivez les paiements
          </p>
        </div>
        <button onClick={() => openInvoiceCreation()} className="btn btn-primary">
          + Nouvelle facture
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(invoiceStats.totalPaid)}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">Total payé</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(invoiceStats.totalUnpaid)}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">En attente de paiement</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-orange-600">
            {invoiceStats.overdueCount}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">En retard</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
          <div className="text-2xl font-bold text-gray-700">
            {invoiceStats.total}
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400">Total factures</div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
        {invoices.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-4 flex justify-center">
              <ReceiptIcon
                aria-hidden="true"
                className="h-16 w-16 text-slate-300 dark:text-slate-600"
              />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2 dark:text-slate-100">
              Aucune facture
            </h3>
            <p className="text-gray-500 mb-4 dark:text-slate-400">
              Commencez par créer votre première facture !
            </p>
            <button onClick={() => openInvoiceCreation()} className="btn btn-primary">
              Créer une facture
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-700">
            {invoices.map((invoice) => {
              const normalizedClientId =
                invoice?.client_id != null ? String(invoice.client_id) : '';
              const clientEntry =
                normalizedClientId && clientEmailMap.has(normalizedClientId)
                  ? clientEmailMap.get(normalizedClientId)
                  : null;
              const defaultEmail = clientEntry?.email || '';
              const customActions =
                typeof renderDocumentActions === 'function'
                  ? renderDocumentActions({
                      document: invoice,
                      defaultEmail,
                      client: clientEntry,
                    })
                  : null;

              return (
                <div
                  key={invoice.id}
                  className={`p-6 transition-all ${
                    isOverdue(invoice)
                      ? 'bg-red-50 border-l-4 border-red-400 dark:bg-red-900/40 dark:border-red-500'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center space-x-3">
                        <h3 className="font-semibold text-gray-800 dark:text-slate-100">
                          {invoice.invoice_number}
                        </h3>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            invoice.status,
                          )}`}
                        >
                          {getStatusText(invoice.status)}
                        </span>
                        {isOverdue(invoice) && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
                            <ClockIcon aria-hidden="true" className="h-3.5 w-3.5" />
                            <span>En retard</span>
                          </span>
                        )}
                      </div>
                      <p className="text-gray-900 font-medium dark:text-slate-100">{invoice.title}</p>
                      <p className="text-gray-600 text-sm dark:text-slate-400">
                        Client: {invoice?.client_name ?? ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-2">
                          <MoneyIcon aria-hidden="true" className="h-4 w-4" />
                          {formatCurrency(invoice.total)}
                        </span>
                        <span className="flex items-center gap-2">
                          <CalendarIcon aria-hidden="true" className="h-4 w-4" />
                          Créée le {formatDate(invoice.created_at)}
                        </span>
                        <span className="flex items-center gap-2">
                          <ClockIcon aria-hidden="true" className="h-4 w-4" />
                          Échéance: {formatDate(invoice.due_date)}
                        </span>
                        {invoice.paid_date && (
                          <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                            <CheckCircleIcon aria-hidden="true" className="h-4 w-4" />
                            Payée le {formatDate(invoice.paid_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      {customActions && (
                        <div className="flex items-center justify-end">{customActions}</div>
                      )}
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditInvoice(invoice)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                          title="Voir/Modifier"
                          aria-label="Voir ou modifier"
                          type="button"
                        >
                          <EditIcon aria-hidden="true" className="h-5 w-5" />
                        </button>
                        {invoice.status === 'sent' && (
                          <button
                            onClick={() => updateInvoiceStatus(invoice.id, 'paid')}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                            title="Marquer comme payée"
                            aria-label="Marquer comme payée"
                            type="button"
                          >
                            <CheckCircleIcon aria-hidden="true" className="h-5 w-5" />
                          </button>
                        )}
                        {invoice.status !== 'paid' && (
                          <button
                            onClick={() => updateInvoiceStatus(invoice.id, 'cancelled')}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                            title="Annuler"
                            aria-label="Annuler"
                            type="button"
                          >
                            <CrossCircleIcon aria-hidden="true" className="h-5 w-5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all dark:text-slate-400 dark:hover:bg-slate-700/60"
                          title="Supprimer"
                          aria-label="Supprimer"
                          type="button"
                        >
                          <TrashIcon aria-hidden="true" className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        )}
      </div>

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <InvoiceModal
          isOpen={showInvoiceModal}
          onClose={handleCloseInvoiceModal}
          onSave={handleSaveInvoice}
          invoice={editingInvoice}
          clients={clients}
          quotes={quotes}
          defaultClientId={pendingClientId}
          prefillSeed={invoiceSeed}
        />
      )}
    </div>
  );
};

const Settings = () => (
  <div className="bg-white p-6 rounded-xl shadow-sm dark:bg-slate-800 dark:text-slate-100">
    <h1 className="text-2xl font-bold text-gray-800 mb-4 dark:text-slate-100">⚙️ Paramètres</h1>
    <p className="text-gray-600 dark:text-slate-400">Module de paramètres en développement...</p>
  </div>
);

// Main App Component
function App() {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogin = async (sessionId) => {
    try {
      setLoading(true);
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      setUser(response.user);
      setSessionToken(response.session_token);
      localStorage.setItem("fleemy_session_token", response.session_token);
      // Clear the hash from URL
      window.history.replaceState(null, null, window.location.pathname);
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setSessionToken(null);
    localStorage.removeItem("fleemy_session_token");
    setCurrentPage("dashboard");
  };

  const checkExistingSession = async () => {
    const token = localStorage.getItem("fleemy_session_token");
    if (token) {
      try {
        const response = await apiFetch("/auth/me");
        setUser(response);
        setSessionToken(token);
      } catch (error) {
        localStorage.removeItem("fleemy_session_token");
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    checkExistingSession();
  }, []);

  const renderCurrentPage = () => {
    const pageProps = { user, sessionToken };

    switch (currentPage) {
      case "dashboard":
        return <Dashboard {...pageProps} />;
      case "planning":
        return <Planning {...pageProps} />;
      case "todos":
        return <TodoList {...pageProps} />;
      case "clients":
        return <Clients {...pageProps} />;
      case "quotes":
        return <Quotes {...pageProps} />;
      case "invoices":
        return <Invoices {...pageProps} />;
      case "settings":
        return <Settings {...pageProps} />;
      default:
        return <Dashboard {...pageProps} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl font-semibold text-gray-700">
            Chargement de Fleemy...
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Votre outil tout-en-un
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Menu Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          isMobile
            ? `fixed left-0 top-0 h-full w-64 z-50 transform transition-transform duration-300 ${
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
              }`
            : "w-64"
        } flex-shrink-0`}
      >
        <Sidebar
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          user={user}
          onLogout={handleLogout}
          isMobile={isMobile}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        {isMobile && (
          <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-gray-600 hover:text-gray-800"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <div className="flex items-center space-x-2">
              <div className="text-lg">📊</div>
              <h1 className="text-lg font-bold text-gray-800">Fleemy</h1>
            </div>
            <div className="w-10"></div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{renderCurrentPage()}</main>
      </div>
    </div>
  );
}

const AppWithBoundary = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithBoundary;
export {
  Dashboard,
  Planning,
  Quotes,
  Invoices,
  Clients,
  EventModal,
  TaskModal,
  WeekNavigationHeader,
  QuoteModal,
  InvoiceModal,
};
