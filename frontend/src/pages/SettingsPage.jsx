import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSettings } from "../context/SettingsContext";
import useNotificationPreferences from "../hooks/useNotificationPreferences";
import { showToast } from "../utils/toast";
import { SectionHeaderRow, Settings as SettingsIcon } from "../ui";
import { EMAIL_TEMPLATE_TOKENS } from "../utils/documents";
import {
  deleteWeeklyTask,
  fetchWeeklyTasksOnce,
  saveWeeklyTask,
  useFirebaseUser,
} from "../firebase";
import {
  TASK_COLOR_KEYS,
  DEFAULT_TASK_COLOR,
  getTaskColor,
} from "../constants/colors";
import {
  TASK_ICON_CATEGORIES,
  getTaskIcon,
  resolveTaskIconCategory,
  resolveTaskIconKey,
} from "../constants/icons";

function Switch({ checked, onToggle, ...props }) {
  const handleToggle = useCallback(() => {
    if (typeof onToggle === "function") {
      onToggle();
    }
  }, [onToggle]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
        checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
      {...props}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const toggleSettings = [
  {
    key: "showFullDay",
    label: "Plage horaire 0h → 24h",
    description: "Étendre l’affichage des heures sur 24h complètes.",
  },
  {
    key: "showWeekends",
    label: "Afficher le week-end",
    description: "Afficher le samedi et le dimanche dans la vue semaine et mois.",
  },
  {
    key: "showTaskPriorityBadges",
    label: "Afficher la priorité des tâches (1 = urgente)",
    description: "Ajoute une pastille numérique 1/2/3 pour montrer la priorité.",
    ariaLabel: "Activer ou désactiver l’affichage visuel de la priorité des tâches",
  },
  {
    key: "showTaskStatusBadges",
    label: "Afficher l’avancement des tâches (à faire / en cours / terminé)",
    description: "Affiche l’état et la couleur de chaque tâche.",
    ariaLabel: "Afficher ou masquer l’état des tâches",
  },
  {
    key: "enableMinutes",
    label: "Minutes détaillées",
    description: "Autoriser la saisie de créneaux comme 09h15 → 10h45.",
  },
  {
    key: "darkMode",
    label: "Thème sombre",
    description: "Utiliser l’interface en mode sombre.",
  },
  {
    key: "requireClientName",
    label: "Client obligatoire",
    description: "Forcer la sélection d’un client pour valider un événement.",
  },
];

const NUMBER_SETTING_KEY = "defaultSlotDurationMinutes";

const DEFAULT_TASK_RANGE = { day: 0, start: "09:00", end: "10:00" };

const flattenIconOptions = () =>
  TASK_ICON_CATEGORIES.flatMap((category) => {
    const iconEntries = Object.keys(category.icons || {});
    return iconEntries.map((key) => ({
      key,
      label: `${getTaskIcon(key)} ${category.label || key}`.trim(),
      category: category.key,
    }));
  });

function TaskManagerSection() {
  const user = useFirebaseUser();
  const planningContext = useMemo(
    () => (user?.uid ? { type: "personal", userId: user.uid } : null),
    [user?.uid]
  );
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const iconOptions = useMemo(() => flattenIconOptions(), []);

  const normalizeManagedTask = useCallback((task, index = 0) => {
    const safeRanges =
      Array.isArray(task?.time_ranges) && task.time_ranges.length
        ? task.time_ranges
        : [{ ...DEFAULT_TASK_RANGE }];

    return {
      id: task?.id || null,
      localId: task?.id || `task-${index}`,
      label: typeof task?.label === "string" ? task.label : task?.name || "",
      price:
        task?.price != null && task.price !== ""
          ? String(task.price)
          : "",
      color: task?.color || DEFAULT_TASK_COLOR,
      icon: resolveTaskIconKey(task?.icon || "briefcase"),
      time_ranges: safeRanges,
      priority: task?.priority ?? null,
      status: task?.status ?? null,
    };
  }, []);

  const refreshTasks = useCallback(async () => {
    if (!planningContext) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await fetchWeeklyTasksOnce(planningContext);
      const normalized = Array.isArray(result)
        ? result.map((task, index) => normalizeManagedTask(task, index))
        : [];
      setTasks(normalized);
    } catch (err) {
      console.error("task manager fetch error", err);
      setError("Impossible de charger les tâches existantes.");
    } finally {
      setLoading(false);
    }
  }, [normalizeManagedTask, planningContext]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const updateTaskField = useCallback((localId, updates) => {
    setTasks((current) =>
      current.map((task) =>
        task.localId === localId ? { ...task, ...updates } : task
      )
    );
  }, []);

  const handleAddTask = useCallback(() => {
    setTasks((current) => [
      ...current,
      {
        id: null,
        localId: `new-${Date.now()}-${current.length}`,
        label: "",
        price: "",
        color: DEFAULT_TASK_COLOR,
        icon: resolveTaskIconKey("briefcase"),
        time_ranges: [{ ...DEFAULT_TASK_RANGE }],
        priority: null,
        status: null,
      },
    ]);
  }, []);

  const handleSaveTask = useCallback(
    async (localId) => {
      if (!planningContext) {
        setError("Connectez-vous pour gérer vos tâches.");
        return;
      }

      const currentTask = tasks.find((task) => task.localId === localId);
      if (!currentTask) {
        return;
      }

      const label = (currentTask.label || "").trim();
      if (!label) {
        setError("Le libellé est requis pour enregistrer la tâche.");
        return;
      }

      const parsedPrice = (() => {
        const raw =
          typeof currentTask.price === "string"
            ? currentTask.price.trim()
            : currentTask.price;
        if (raw === "" || raw == null) {
          return null;
        }
        const numeric = Number.parseFloat(raw);
        return Number.isFinite(numeric) ? numeric : raw;
      })();

      setSavingId(localId);
      setError("");
      try {
        const saved = await saveWeeklyTask(planningContext, {
          ...currentTask,
          id: currentTask.id || undefined,
          label,
          price: parsedPrice,
          color: currentTask.color || DEFAULT_TASK_COLOR,
          icon: resolveTaskIconKey(currentTask.icon || "briefcase"),
          time_ranges:
            Array.isArray(currentTask.time_ranges) &&
            currentTask.time_ranges.length
              ? currentTask.time_ranges
              : [{ ...DEFAULT_TASK_RANGE }],
        });
        const normalized = normalizeManagedTask(saved);
        setTasks((current) =>
          current.map((task) =>
            task.localId === localId
              ? { ...normalized, localId: normalized.id || localId }
              : task
          )
        );
        showToast("Tâche enregistrée");
      } catch (err) {
        console.error("task manager save error", err);
        setError("Impossible de sauvegarder la tâche.");
      } finally {
        setSavingId(null);
      }
    },
    [normalizeManagedTask, planningContext, tasks]
  );

  const handleDeleteTask = useCallback(
    async (localId) => {
      const currentTask = tasks.find((task) => task.localId === localId);
      if (!currentTask) {
        return;
      }
      if (!planningContext) {
        setError("Connectez-vous pour gérer vos tâches.");
        return;
      }
      if (!currentTask.id) {
        setTasks((current) => current.filter((task) => task.localId !== localId));
        return;
      }
      setDeletingId(localId);
      setError("");
      try {
        await deleteWeeklyTask(planningContext, currentTask.id);
        setTasks((current) => current.filter((task) => task.localId !== localId));
        showToast("Tâche supprimée");
      } catch (err) {
        console.error("task manager delete error", err);
        setError("Impossible de supprimer la tâche.");
      } finally {
        setDeletingId(null);
      }
    },
    [planningContext, tasks]
  );

  const renderTaskRow = (task) => {
    const activeCategory =
      resolveTaskIconCategory(task.icon) || iconOptions[0]?.category;
    const categoryIcons = iconOptions.filter(
      (entry) => entry.category === activeCategory
    );

    return (
      <div
        key={task.localId}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Libellé
            <input
              type="text"
              value={task.label}
              onChange={(event) =>
                updateTaskField(task.localId, { label: event.target.value })
              }
              className="form-input"
              placeholder="Ex. Accompagnement"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Tarif horaire
            <input
              type="number"
              step="0.5"
              value={task.price}
              onChange={(event) =>
                updateTaskField(task.localId, { price: event.target.value })
              }
              className="form-input"
              placeholder="Optionnel"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Couleur
            <select
              value={task.color}
              onChange={(event) =>
                updateTaskField(task.localId, { color: event.target.value })
              }
              className="form-input"
            >
              {TASK_COLOR_KEYS.map((colorKey) => (
                <option key={colorKey} value={getTaskColor(colorKey)}>
                  {colorKey}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <label className="flex flex-col gap-1">
              Catégorie d’icône
              <select
                value={activeCategory || ""}
                onChange={(event) => {
                  const nextCategory = event.target.value;
                  const nextIcons = iconOptions.filter(
                    (entry) => entry.category === nextCategory
                  );
                  updateTaskField(task.localId, {
                    icon: nextIcons[0]?.key || task.icon,
                  });
                }}
                className="form-input"
              >
                {TASK_ICON_CATEGORIES.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label || category.key}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Icône
              <select
                value={task.icon}
                onChange={(event) =>
                  updateTaskField(task.localId, { icon: event.target.value })
                }
                className="form-input"
              >
                {categoryIcons.map((icon) => (
                  <option key={icon.key} value={icon.key}>
                    {icon.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleSaveTask(task.localId)}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-indigo-300 dark:focus-visible:ring-offset-slate-900"
            disabled={savingId === task.localId}
          >
            {savingId === task.localId ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => handleDeleteTask(task.localId)}
            className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300 dark:border-red-500/50 dark:text-red-200 dark:hover:bg-red-500/10 dark:focus-visible:ring-offset-slate-900"
            disabled={deletingId === task.localId}
          >
            {deletingId === task.localId ? "Suppression…" : "Supprimer"}
          </button>
          {task.id && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ID : {task.id}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
        <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Gestionnaire des tâches
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Retrouvez vos tâches existantes pour les réutiliser rapidement dans le planning.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/60 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        {!planningContext && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Connectez-vous pour gérer vos tâches personnalisées.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Chargement des tâches…</p>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            <p>Aucune tâche enregistrée pour le moment.</p>
            <div>
              <button
                type="button"
                onClick={handleAddTask}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                disabled={!planningContext}
              >
                Ajouter une tâche
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => renderTaskRow(task))}
            <div>
              <button
                type="button"
                onClick={handleAddTask}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
                disabled={!planningContext}
              >
                Ajouter une tâche
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { settings, loading, updateSetting } = useSettings();
  const { notificationsEnabled, toggleNotifications } = useNotificationPreferences();
  const [durationInput, setDurationInput] = useState("60");
  const [startHourInput, setStartHourInput] = useState("");
  const [endHourInput, setEndHourInput] = useState("");
  const [hourlyRateInput, setHourlyRateInput] = useState("0");
  const [emailSubjectTemplateInput, setEmailSubjectTemplateInput] = useState("");
  const [emailBodyTemplateInput, setEmailBodyTemplateInput] = useState("");

  const handleNotificationsToggle = useCallback(() => {
    const nextValue = !notificationsEnabled;
    toggleNotifications();

    if (typeof window !== "undefined" && typeof document !== "undefined") {
      showToast(nextValue ? "Notifications activées" : "Notifications désactivées");
    }
  }, [notificationsEnabled, toggleNotifications]);

  useEffect(() => {
    if (settings && typeof settings[NUMBER_SETTING_KEY] === "number") {
      setDurationInput(String(settings[NUMBER_SETTING_KEY]));
    }
  }, [settings]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const fallbackStart =
      typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
    const fallbackEnd =
      typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;

    const activeElementId =
      typeof document !== "undefined" ? document.activeElement?.id : null;

    if (activeElementId !== "setting-dayStartHour-input") {
      setStartHourInput(String(fallbackStart));
    }

    if (activeElementId !== "setting-dayEndHour-input") {
      setEndHourInput(String(fallbackEnd));
    }
  }, [settings?.dayEndHour, settings?.dayStartHour]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const activeElementId =
      typeof document !== "undefined" ? document.activeElement?.id : null;

    if (activeElementId === "setting-hourlyRateGlobal-input") {
      return;
    }

    const numericValue = Number(settings.hourlyRateGlobal);
    const safeValue = Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
    setHourlyRateInput(String(safeValue));
  }, [settings, settings?.hourlyRateGlobal]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const activeElementId =
      typeof document !== "undefined" ? document.activeElement?.id : null;

    if (activeElementId !== "setting-emailSubjectTemplate-input") {
      setEmailSubjectTemplateInput(settings.emailSubjectTemplate || "");
    }

    if (activeElementId !== "setting-emailBodyTemplate-textarea") {
      const normalized = (settings.emailBodyTemplate || "").replace(/\r\n/g, "\n");
      setEmailBodyTemplateInput(normalized);
    }
  }, [settings, settings?.emailBodyTemplate, settings?.emailSubjectTemplate]);

  const handleToggle = useCallback(
    (key) => {
      if (!settings) {
        return;
      }
      const nextValue = !(settings[key] === true);
      updateSetting?.(key, nextValue);
    },
    [settings, updateSetting]
  );

  const emailTemplateTokens = useMemo(
    () => Object.entries(EMAIL_TEMPLATE_TOKENS),
    [],
  );

  const handleDurationChange = useCallback((event) => {
    setDurationInput(event.target.value);
  }, []);

  const handleHourlyRateChange = useCallback((event) => {
    setHourlyRateInput(event.target.value);
  }, []);

  const handleEmailSubjectTemplateChange = useCallback((event) => {
    setEmailSubjectTemplateInput(event.target.value);
  }, []);

  const handleEmailBodyTemplateChange = useCallback((event) => {
    setEmailBodyTemplateInput(event.target.value);
  }, []);

  const commitDurationValue = useCallback(() => {
    if (!settings) {
      return;
    }

    const parsed = parseInt(durationInput, 10);
    if (Number.isNaN(parsed)) {
      setDurationInput(
        String(
          typeof settings[NUMBER_SETTING_KEY] === "number"
            ? settings[NUMBER_SETTING_KEY]
            : 60
        )
      );
      return;
    }

    const clamped = Math.min(480, Math.max(5, parsed));
    setDurationInput(String(clamped));

    if (settings[NUMBER_SETTING_KEY] !== clamped) {
      updateSetting?.(NUMBER_SETTING_KEY, clamped);
    }
  }, [durationInput, settings, updateSetting]);

  const handleCommitStart = useCallback(() => {
    if (!settings) {
      return;
    }

    if (settings.showFullDay === true) {
      const fallbackStart =
        typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
      setStartHourInput(String(fallbackStart));
      return;
    }

    const parsed = parseInt(startHourInput, 10);
    if (Number.isNaN(parsed)) {
      const fallbackStart =
        typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
      setStartHourInput(String(fallbackStart));
      return;
    }

    let clampedStart = parsed;
    if (clampedStart < 0) {
      clampedStart = 0;
    } else if (clampedStart > 23) {
      clampedStart = 23;
    }

    const currentEnd =
      typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;

    if (clampedStart >= currentEnd) {
      let nextEnd = clampedStart + 1;
      if (nextEnd > 24) {
        nextEnd = 24;
      }
      if (nextEnd !== settings.dayEndHour) {
        updateSetting?.("dayEndHour", nextEnd);
      }
      setEndHourInput(String(nextEnd));
    }

    if (clampedStart !== settings.dayStartHour) {
      updateSetting?.("dayStartHour", clampedStart);
    }

    setStartHourInput(String(clampedStart));
  }, [settings, startHourInput, updateSetting]);

  const handleCommitEnd = useCallback(() => {
    if (!settings) {
      return;
    }

    if (settings.showFullDay === true) {
      const fallbackEnd =
        typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;
      setEndHourInput(String(fallbackEnd));
      return;
    }

    const parsed = parseInt(endHourInput, 10);
    if (Number.isNaN(parsed)) {
      const fallbackEnd =
        typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;
      setEndHourInput(String(fallbackEnd));
      return;
    }

    let clampedEnd = parsed;
    if (clampedEnd < 1) {
      clampedEnd = 1;
    } else if (clampedEnd > 24) {
      clampedEnd = 24;
    }

    const currentStart =
      typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;

    if (clampedEnd <= currentStart) {
      let nextStart = clampedEnd - 1;
      if (nextStart < 0) {
        nextStart = 0;
      }
      if (nextStart !== settings.dayStartHour) {
        updateSetting?.("dayStartHour", nextStart);
      }
      setStartHourInput(String(nextStart));
    }

    if (clampedEnd !== settings.dayEndHour) {
      updateSetting?.("dayEndHour", clampedEnd);
    }

    setEndHourInput(String(clampedEnd));
  }, [endHourInput, settings, updateSetting]);

  const commitHourlyRate = useCallback(() => {
    if (!settings) {
      return;
    }

    const raw = typeof hourlyRateInput === "string" ? hourlyRateInput.trim() : String(hourlyRateInput ?? "");
    const normalizedRaw = raw.replace(",", ".");
    const parsed = normalizedRaw === "" ? 0 : Number.parseFloat(normalizedRaw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      const fallback = Number.isFinite(Number(settings.hourlyRateGlobal)) && Number(settings.hourlyRateGlobal) >= 0
        ? Number(settings.hourlyRateGlobal)
        : 0;
      setHourlyRateInput(String(fallback));
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    setHourlyRateInput(String(rounded));

    if (settings.hourlyRateGlobal !== rounded) {
      updateSetting?.("hourlyRateGlobal", rounded);
    }
  }, [hourlyRateInput, settings, updateSetting]);

  const commitEmailSubjectTemplate = useCallback(() => {
    if (!settings) {
      return;
    }

    const nextValue = emailSubjectTemplateInput.trim();
    if ((settings.emailSubjectTemplate || "") !== nextValue) {
      updateSetting?.("emailSubjectTemplate", nextValue);
    }
  }, [emailSubjectTemplateInput, settings, updateSetting]);

  const commitEmailBodyTemplate = useCallback(() => {
    if (!settings) {
      return;
    }

    const normalized = emailBodyTemplateInput.replace(/\r\n/g, "\n");
    if ((settings.emailBodyTemplate || "") !== normalized) {
      updateSetting?.("emailBodyTemplate", normalized);
    }
  }, [emailBodyTemplateInput, settings, updateSetting]);

  const handleResetEmailTemplates = useCallback(() => {
    setEmailSubjectTemplateInput("");
    setEmailBodyTemplateInput("");
    updateSetting?.("emailSubjectTemplate", "");
    updateSetting?.("emailBodyTemplate", "");
    showToast("Modèle d’e-mail réinitialisé");
  }, [showToast, updateSetting]);

  const fullDay = settings?.showFullDay === true;

  const showFullDayToggle = toggleSettings.find((item) => item.key === "showFullDay");
  const additionalToggleSettings = toggleSettings.filter((item) => item.key !== "showFullDay");

  const renderToggleRow = useCallback(
    (item) => {
      if (!item) {
        return null;
      }
      const labelId = `setting-${item.key}-label`;
      const descriptionId = `setting-${item.key}-description`;

      return (
        <div
          key={item.key}
          className="flex items-center justify-between border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-700"
        >
          <div className="flex-1 pr-4">
            <p id={labelId} className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {item.label}
            </p>
            <p id={descriptionId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {item.description}
            </p>
          </div>
          <Switch
            checked={settings[item.key] === true}
            onToggle={() => handleToggle(item.key)}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            aria-label={item.ariaLabel}
          />
        </div>
      );
    },
    [handleToggle, settings]
  );

  if (loading || !settings) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center text-sm text-slate-700 dark:text-slate-200">
        Chargement…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <SectionHeaderRow
          headingLevel={1}
          icon={<SettingsIcon aria-hidden="true" className="h-6 w-6" />}
          iconClassName="text-slate-900 dark:text-slate-100"
          title="Paramètres de l’application"
          titleClassName="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl"
          className="items-start gap-3"
        />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Personnalisez l’affichage du planning et préparez les modèles d’e-mails envoyés à vos clients. Les modifications sont enregistrées automatiquement.
        </p>
      </header>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 pr-4">
            <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">Notifications</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Contrôlez l’affichage de la cloche et la réception des alertes locales.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label
              htmlFor="settings-notifications-toggle"
              className="text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Activer les notifications
            </label>
            <div className="relative inline-flex h-6 w-11 items-center">
              <input
                id="settings-notifications-toggle"
                type="checkbox"
                checked={notificationsEnabled}
                onChange={handleNotificationsToggle}
                aria-label="Activer ou désactiver les notifications"
                className="peer relative h-6 w-11 cursor-pointer appearance-none rounded-full border border-transparent bg-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white checked:bg-indigo-600 dark:bg-slate-600 dark:focus-visible:ring-offset-slate-900 dark:checked:bg-indigo-500"
              />
              <span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {renderToggleRow(showFullDayToggle)}

        <div className="border-b border-slate-200 px-4 py-4 last:border-b-0 dark:border-slate-700">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="sm:pr-4">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Heures affichées dans la journée
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Contrôle la plage horaire visible dans la vue Semaine.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Début
                <input
                  id="setting-dayStartHour-input"
                  type="number"
                  min={0}
                  max={23}
                  value={startHourInput}
                  onChange={(event) => setStartHourInput(event.target.value)}
                  onBlur={handleCommitStart}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCommitStart();
                    }
                  }}
                  disabled={fullDay}
                  className="mt-1 w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                />
              </label>

              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Fin
                <input
                  id="setting-dayEndHour-input"
                  type="number"
                  min={1}
                  max={24}
                  value={endHourInput}
                  onChange={(event) => setEndHourInput(event.target.value)}
                  onBlur={handleCommitEnd}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCommitEnd();
                    }
                  }}
                  disabled={fullDay}
                  className="mt-1 w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                />
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Si l’option « Plage horaire 0h → 24h » est activée, l’affichage montrera automatiquement toutes les heures, de 00:00 à
            24:00.
          </p>
        </div>

        {additionalToggleSettings.map((item) => renderToggleRow(item))}

        <div className="flex items-center justify-between py-3 border-b border-slate-200 last:border-b-0 dark:border-slate-700 px-4">
          <div className="flex-1 pr-4">
            <p
              id={`setting-${NUMBER_SETTING_KEY}-label`}
              className="text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Durée par défaut d’un créneau
            </p>
            <p
              id={`setting-${NUMBER_SETTING_KEY}-description`}
              className="mt-1 text-xs text-slate-500 dark:text-slate-400"
            >
              Durée proposée automatiquement lors de la création d’un nouveau créneau (en minutes).
            </p>
          </div>
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={durationInput}
            onChange={handleDurationChange}
            onBlur={commitDurationValue}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDurationValue();
              }
            }}
            aria-labelledby={`setting-${NUMBER_SETTING_KEY}-label`}
            aria-describedby={`setting-${NUMBER_SETTING_KEY}-description`}
            className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4 last:border-b-0 dark:border-slate-700">
          <div className="flex-1 pr-4">
            <p
              id="setting-hourlyRateGlobal-label"
              className="text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Taux horaire global
            </p>
            <p
              id="setting-hourlyRateGlobal-description"
              className="mt-1 text-xs text-slate-500 dark:text-slate-400"
            >
              Ce taux est utilisé pour calculer le total facturé sur les événements, sauf si un client a un taux personnalisé.
            </p>
          </div>
          <input
            id="setting-hourlyRateGlobal-input"
            type="number"
            min={0}
            step={0.5}
            value={hourlyRateInput}
            onChange={handleHourlyRateChange}
            onBlur={commitHourlyRate}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitHourlyRate();
              }
            }}
            aria-labelledby="setting-hourlyRateGlobal-label"
            aria-describedby="setting-hourlyRateGlobal-description"
            className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      <TaskManagerSection />

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
          <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">Modèles d’e-mails</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configurez l’objet et le message proposés lors de l’envoi des devis et factures.
          </p>
        </div>

        <div className="space-y-5 px-4 py-4">
          <div className="space-y-2">
            <label
              htmlFor="setting-emailSubjectTemplate-input"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Objet par défaut
            </label>
            <input
              id="setting-emailSubjectTemplate-input"
              type="text"
              value={emailSubjectTemplateInput}
              onChange={handleEmailSubjectTemplateChange}
              onBlur={commitEmailSubjectTemplate}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitEmailSubjectTemplate();
                }
              }}
              placeholder="Votre devis {{documentNumber}}"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              L’objet est prérempli pour chaque envoi et reste modifiable dans la fenêtre d’e-mail.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="setting-emailBodyTemplate-textarea"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Message proposé
            </label>
            <textarea
              id="setting-emailBodyTemplate-textarea"
              value={emailBodyTemplateInput}
              onChange={handleEmailBodyTemplateChange}
              onBlur={commitEmailBodyTemplate}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  commitEmailBodyTemplate();
                }
              }}
              rows={6}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
              placeholder={"Bonjour,\n\nVeuillez trouver ci-joint votre {{documentType}}."}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Les sauts de ligne sont conservés lors de l’envoi. Utilisez Ctrl/Cmd + Entrée pour enregistrer rapidement.
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <p className="font-medium text-slate-700 dark:text-slate-200">Variables disponibles</p>
            <ul className="mt-2 space-y-1">
              {emailTemplateTokens.map(([token, description]) => (
                <li key={token} className="flex flex-wrap items-baseline gap-2">
                  <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                    {token}
                  </code>
                  <span>{description}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ces contenus s’appliquent aux e-mails envoyés depuis les pages Devis et Factures.
            </p>
            <button
              type="button"
              onClick={handleResetEmailTemplates}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
            >
              Réinitialiser le modèle
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
