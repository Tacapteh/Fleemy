import React, { useEffect, useState } from 'react';
import { saveWeeklyTask } from '../firebase';
import {
  TASK_ICON_CATEGORIES,
  getTaskIcon,
  resolveTaskIconCategory,
  resolveTaskIconKey,
} from '../constants/icons';
import {
  TASK_COLOR_KEYS,
  getTaskColor,
  DEFAULT_TASK_COLOR,
  PASTEL_COLORS,
} from '../constants/colors';
import { useSettings } from '../context/SettingsContext';
import TaskModalStyles from './TaskModalStyles';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const DEFAULT_TIME_RANGE = { day: 0, start: '09:00', end: '10:00' };
const START_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  `${String(index).padStart(2, '0')}:00`
);
const END_HOUR_OPTIONS = [...START_HOUR_OPTIONS.slice(1), '24:00'];

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const DETAILED_MODE_MIN_STEP = 15;

const normalizePriorityValue = (value) => {
  if (typeof value !== 'string') {
    return 'medium';
  }
  const normalized = value.trim().toLowerCase();
  return ['high', 'medium', 'low'].includes(normalized) ? normalized : 'medium';
};

const normalizeStatusValue = (value) => {
  if (typeof value !== 'string') {
    return 'todo';
  }
  const normalized = value.trim().toLowerCase();
  return ['todo', 'doing', 'done'].includes(normalized) ? normalized : 'todo';
};

const formatDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeTaskDateInput = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const cloned = new Date(value);
    cloned.setHours(0, 0, 0, 0);
    return formatDateOnly(cloned);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const candidate = trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return formatDateOnly(parsed);
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return normalizeTaskDateInput(value.toDate());
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return formatDateOnly(parsed);
  }

  return null;
};

const minutesToTimeString = (totalMinutes) => {
  const clamped = Math.max(0, Math.min(totalMinutes, MINUTES_PER_DAY));
  if (clamped === MINUTES_PER_DAY) {
    return '24:00';
  }
  const hours = Math.floor(clamped / MINUTES_PER_HOUR);
  const minutes = clamped % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const createDefaultTimeRange = () => ({ ...DEFAULT_TIME_RANGE });

const toDayIndex = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) {
    return value;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 6) {
    return parsed;
  }
  return null;
};

const normalizeHourValue = (
  value,
  { allowEndOfDay = false, allowMinutes = false, roundMode = 'floor' } = {}
) => {
  if (value == null) {
    return null;
  }

  const raw = typeof value === 'number' ? String(value) : String(value).trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] != null ? Number.parseInt(match[2], 10) : 0;

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  if (minutes < 0 || minutes > 59) {
    return null;
  }

  if (allowMinutes) {
    if (hours === 24) {
      if (!allowEndOfDay || minutes !== 0) {
        return null;
      }
      return '24:00';
    }
    if (hours < 0 || hours > 23) {
      return null;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (hours === 24) {
    if (!allowEndOfDay || minutes !== 0) {
      return null;
    }
    return '24:00';
  }

  if (hours < 0 || hours > 23) {
    return null;
  }

  let normalizedHours = hours;
  if (roundMode === 'ceil' && minutes > 0) {
    normalizedHours += 1;
    if (allowEndOfDay && normalizedHours > 24) {
      normalizedHours = 24;
    }
  }

  if (!allowEndOfDay && normalizedHours > 23) {
    return null;
  }

  if (allowEndOfDay && normalizedHours > 24) {
    normalizedHours = 24;
  }

  if (!allowEndOfDay && normalizedHours === 24) {
    return null;
  }

  return `${String(normalizedHours).padStart(2, '0')}:00`;
};

const timeStringToMinutes = (time) => {
  if (typeof time !== 'string') {
    return null;
  }
  const parts = time.split(':');
  if (parts.length !== 2) {
    return null;
  }
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }
  if (hours === 24) {
    return minutes === 0 ? 24 * 60 : null;
  }
  if (hours < 0 || hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
};

const normalizeTimeRange = (
  range,
  { adjustEndIfNeeded = false, allowMinutes = false } = {}
) => {
  if (!range) {
    return null;
  }

  const day = toDayIndex(range.day ?? range.dayIndex ?? range.weekday);
  const start = normalizeHourValue(range.start, {
    allowMinutes,
    roundMode: allowMinutes ? 'none' : 'floor',
  });
  const end = normalizeHourValue(range.end, {
    allowEndOfDay: true,
    allowMinutes,
    roundMode: allowMinutes ? 'none' : 'ceil',
  });

  if (day == null || !start || !end) {
    return null;
  }

  let startMinutes = timeStringToMinutes(start);
  let endMinutes = timeStringToMinutes(end);

  if (startMinutes == null || endMinutes == null) {
    return null;
  }

  const minimumDuration = allowMinutes ? DETAILED_MODE_MIN_STEP : MINUTES_PER_HOUR;

  if (!allowMinutes) {
    startMinutes = Math.floor(startMinutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
    endMinutes = Math.ceil(endMinutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
  }

  let finalEndMinutes = endMinutes;
  if (finalEndMinutes <= startMinutes) {
    if (!adjustEndIfNeeded) {
      return null;
    }
    finalEndMinutes = Math.min(startMinutes + minimumDuration, MINUTES_PER_DAY);
    if (finalEndMinutes <= startMinutes) {
      return null;
    }
  }

  if (!allowMinutes) {
    finalEndMinutes = Math.ceil(finalEndMinutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
    if (finalEndMinutes > MINUTES_PER_DAY) {
      finalEndMinutes = MINUTES_PER_DAY;
    }
  } else {
    finalEndMinutes = Math.min(finalEndMinutes, MINUTES_PER_DAY);
  }

  const finalStart = minutesToTimeString(startMinutes);
  const finalEnd = minutesToTimeString(finalEndMinutes);

  return { day, start: finalStart, end: finalEnd };
};

const ensureTimeRanges = (ranges, { allowMinutes = false } = {}) => {
  if (!Array.isArray(ranges)) {
    return [createDefaultTimeRange()];
  }

  const normalized = ranges
    .map((range) => normalizeTimeRange(range, { adjustEndIfNeeded: true, allowMinutes }))
    .filter(Boolean);
  if (!normalized.length) {
    return [createDefaultTimeRange()];
  }
  return normalized;
};

const WeeklyTaskForm = ({
  initialTask = null,
  onSave,
  onCancel,
  onDelete,
  context,
  readOnly = false,
  weekStartISO = null,
  onSwitchToEvent,
}) => {
  const settingsContext = useSettings() || {};
  const { settings, showTaskStatusBadges } = settingsContext;
  const allowMinutes = settings?.enableMinutes === true;
  const shouldShowStatusField = showTaskStatusBadges !== false;
  const timeInputStep = allowMinutes ? 900 : 3600;
  const initialIconValue = initialTask?.icon || 'briefcase';
  const defaultIconKey = resolveTaskIconKey(initialIconValue);
  const defaultIconCategory =
    resolveTaskIconCategory(initialIconValue) || TASK_ICON_CATEGORIES[0]?.key || 'work_general';

  const [task, setTask] = useState(() => ({
    label: initialTask?.label || '',
    price:
      initialTask?.price != null && initialTask.price !== ''
        ? String(initialTask.price)
        : '',
    color: initialTask?.color || DEFAULT_TASK_COLOR,
    icon: defaultIconKey,
    time_ranges: ensureTimeRanges(initialTask?.time_ranges, { allowMinutes }),
    priority: normalizePriorityValue(initialTask?.priority),
    status: shouldShowStatusField
      ? normalizeStatusValue(initialTask?.status)
      : 'todo',
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedIconCategory, setSelectedIconCategory] = useState(defaultIconCategory);

  useEffect(() => {
    setTask((current) => ({
      ...current,
      time_ranges: ensureTimeRanges(current.time_ranges, { allowMinutes }),
    }));
  }, [allowMinutes]);

  useEffect(() => {
    if (!shouldShowStatusField) {
      setTask((current) => ({ ...current, status: 'todo' }));
    }
  }, [shouldShowStatusField]);

  const addTimeRange = () => {
    setTask((current) => ({
      ...current,
      time_ranges: [
        ...current.time_ranges,
        createDefaultTimeRange(),
      ],
    }));
  };

  const updateTimeRange = (index, field, value) => {
    setTask((current) => {
      const newRanges = current.time_ranges.map((range, rangeIndex) => {
        if (rangeIndex !== index) {
          return range;
        }

        if (field === 'day') {
          const day = toDayIndex(value);
          if (day == null) {
            return range;
          }
          return { ...range, day };
        }

        if (field === 'start') {
          const startValue = normalizeHourValue(value, {
            allowMinutes,
            roundMode: allowMinutes ? 'none' : 'floor',
          });
          if (!startValue) {
            return range;
          }
          return { ...range, start: startValue };
        }

        if (field === 'end') {
          const endValue = normalizeHourValue(value, {
            allowEndOfDay: true,
            allowMinutes,
            roundMode: allowMinutes ? 'none' : 'ceil',
          });
          if (!endValue) {
            return range;
          }
          return { ...range, end: endValue };
        }

        return range;
      });

      return { ...current, time_ranges: newRanges };
    });
  };

  const removeTimeRange = (index) => {
    setTask((current) => {
      if (current.time_ranges.length === 1) {
        return current;
      }
      const newRanges = current.time_ranges.filter((_, i) => i !== index);
      return { ...current, time_ranges: newRanges };
    });
  };

  const validateTimeRange = (range) => {
    if (typeof range.day !== 'number' || range.day < 0 || range.day > 6) {
      return 'Jour invalide';
    }

    const invalidFormatMessage = allowMinutes
      ? "Format d'heure invalide (HH:MM)"
      : "Format d'heure invalide (heures pleines uniquement)";

    const start = normalizeHourValue(range.start, {
      allowMinutes,
      roundMode: allowMinutes ? 'none' : 'floor',
    });
    if (!start) {
      return invalidFormatMessage;
    }

    const end = normalizeHourValue(range.end, {
      allowEndOfDay: true,
      allowMinutes,
      roundMode: allowMinutes ? 'none' : 'ceil',
    });
    if (!end) {
      return invalidFormatMessage;
    }

    const startMinutes = timeStringToMinutes(start);
    const endMinutes = timeStringToMinutes(end);

    if (startMinutes == null || endMinutes == null) {
      return invalidFormatMessage;
    }

    if (!allowMinutes) {
      const flooredStart = Math.floor(startMinutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
      const ceiledEnd = Math.ceil(endMinutes / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
      if (flooredStart >= ceiledEnd) {
        return "L'heure de fin doit être après l'heure de début";
      }
    } else if (startMinutes >= endMinutes) {
      return "L'heure de fin doit être après l'heure de début";
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (readOnly) {
      setError('Ce planning est en lecture seule.');
      return;
    }

    if (!context) {
      setError('Impossible de déterminer le contexte du planning.');
      return;
    }

    if (!task.label.trim()) {
      setError('Le libellé est requis');
      return;
    }

    if (!Array.isArray(task.time_ranges) || task.time_ranges.length === 0) {
      setError('Au moins un créneau horaire est requis');
      return;
    }

    for (let i = 0; i < task.time_ranges.length; i += 1) {
      const validationError = validateTimeRange(task.time_ranges[i]);
      if (validationError) {
        setError(`Créneau ${i + 1}: ${validationError}`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const sanitizedRanges = task.time_ranges
        .map((range) => normalizeTimeRange(range, { allowMinutes }))
        .filter(Boolean);
      if (!sanitizedRanges.length) {
        setError('Au moins un créneau horaire valide est requis');
        setIsSubmitting(false);
        return;
      }

      let resolvedWeekStart = null;
      if (typeof weekStartISO === 'string' && weekStartISO) {
        const parsedWeekStart = new Date(`${weekStartISO}T00:00:00`);
        if (!Number.isNaN(parsedWeekStart.getTime())) {
          parsedWeekStart.setHours(0, 0, 0, 0);
          resolvedWeekStart = parsedWeekStart;
        }
      }

      const isEditing = Boolean(initialTask?.id);
      const existingCreationDate = normalizeTaskDateInput(
        initialTask?.dateISO ??
          initialTask?.dateIso ??
          initialTask?.date_iso ??
          initialTask?.taskDate ??
          initialTask?.task_date ??
          initialTask?.task_day_iso ??
          null,
      );

      let creationDateISO = existingCreationDate || null;
      if (!creationDateISO && !isEditing) {
        if (resolvedWeekStart instanceof Date) {
          creationDateISO = formatDateOnly(resolvedWeekStart);
        } else {
          creationDateISO = formatDateOnly(new Date());
        }
      }

      const rangesWithDates = sanitizedRanges.map((range, index) => {
        let computedDate = null;

        if (resolvedWeekStart && typeof range.day === 'number') {
          const dayDate = new Date(resolvedWeekStart);
          dayDate.setDate(resolvedWeekStart.getDate() + range.day);
          computedDate = formatDateOnly(dayDate);
        }

        if (!computedDate) {
          const originalRange = initialTask?.time_ranges?.[index];
          const legacyDate =
            originalRange?.task_date ||
            originalRange?.taskDate ||
            originalRange?.task_day_iso ||
            originalRange?.taskDayIso ||
            null;
          computedDate = normalizeTaskDateInput(legacyDate);
        }

        if (computedDate) {
          return {
            ...range,
            task_date: computedDate,
            task_day_iso: computedDate,
          };
        }

        return range;
      });

      let priceValueRaw = '';
      if (typeof task.price === 'string') {
        priceValueRaw = task.price;
      } else if (task.price != null) {
        priceValueRaw = String(task.price);
      }
      const priceValue = priceValueRaw.trim();
      const normalizedStatus = shouldShowStatusField
        ? normalizeStatusValue(task.status)
        : 'todo';

      const taskData = {
        ...task,
        time_ranges: rangesWithDates,
        id: initialTask?.id || undefined,
        price: priceValue ? parseFloat(priceValue) : null,
        priority: normalizePriorityValue(task.priority),
        status: normalizedStatus,
        ...(creationDateISO ? { dateISO: creationDateISO } : {}),
      };

      const savedTask = await saveWeeklyTask(context, taskData);

      if (onSave) {
        onSave(savedTask);
      }
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err);
      setError('Erreur lors de la sauvegarde de la tâche hebdomadaire');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeIconCategory =
    TASK_ICON_CATEGORIES.find((category) => category.key === selectedIconCategory) ||
    TASK_ICON_CATEGORIES[0];

  let iconOptions = activeIconCategory ? Object.keys(activeIconCategory.icons) : [];
  const resolvedCurrentIconKey = resolveTaskIconKey(task.icon);
  if (resolvedCurrentIconKey && !iconOptions.includes(resolvedCurrentIconKey)) {
    iconOptions = [...iconOptions, resolvedCurrentIconKey];
  }

  const handleIconCategoryChange = (event) => {
    const { value } = event.target;
    setSelectedIconCategory(value);

    const category = TASK_ICON_CATEGORIES.find((item) => item.key === value);
    if (!category) {
      return;
    }

    const categoryIconKeys = Object.keys(category.icons);
    if (!categoryIconKeys.length) {
      return;
    }

    setTask((currentTask) => {
      const currentIconKey = resolveTaskIconKey(currentTask.icon);
      if (categoryIconKeys.includes(currentIconKey)) {
        return currentTask;
      }
      return { ...currentTask, icon: categoryIconKeys[0] };
    });
  };

  const colorOptions = TASK_COLOR_KEYS;

  const getColorLabel = (colorKey) => PASTEL_COLORS[colorKey]?.name || colorKey;

  const canSwitchToEvent =
    typeof onSwitchToEvent === 'function' && !readOnly;

  return (
    <div className="modal-overlay weekly-task-overlay">
      <div className="modal-content weekly-task-modal dark:bg-slate-900 dark:text-slate-100">
        <h2 className="modal-header dark:text-slate-100 dark:border-slate-700">
          {initialTask ? 'Modifier la tâche hebdomadaire' : 'Nouvelle tâche hebdomadaire'}
        </h2>

        {canSwitchToEvent && (
          <div
            className="modal-tab-group"
            role="group"
            aria-label="Choisir le type de création"
          >
            <button
              type="button"
              className="modal-tab"
              onClick={() => onSwitchToEvent()}
              disabled={isSubmitting}
            >
              Événement
            </button>
            <button
              type="button"
              className="modal-tab is-active"
              aria-current="page"
            >
              Tâche
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="weekly-task-form">
          {readOnly && (
            <div className="weekly-task-alert weekly-task-alert-info" role="note">
              Vous consultez ce planning en lecture seule.
            </div>
          )}

          {error && (
            <div className="weekly-task-alert weekly-task-alert-error" role="alert">
              {error}
            </div>
          )}

          <fieldset className="weekly-task-fieldset" disabled={readOnly || isSubmitting}>
            <div className="form-group">
              <label className="form-label" htmlFor="task-label">Libellé *</label>
              <input
                id="task-label"
                type="text"
                value={task.label}
                onChange={(e) => setTask({ ...task, label: e.target.value })}
                placeholder="Nom de la tâche"
                required
                aria-describedby="task-label-help"
                className="form-input"
              />
              <span id="task-label-help" className="weekly-task-hint">
                Ce nom apparaîtra dans votre planning.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="weekly-task-range-0">
                Créneaux horaires *
                <span className="weekly-task-hint-inline">
                  {allowMinutes ? ' (heures et minutes)' : ' (heures pleines uniquement)'}
                </span>
              </label>
              <div className="weekly-task-time-ranges">
                {task.time_ranges.map((range, index) => (
                  <div key={index} className="weekly-task-range">
                    <div className="weekly-task-range-controls">
                      <select
                        id={index === 0 ? 'weekly-task-range-0' : undefined}
                        value={range.day}
                        onChange={(e) => updateTimeRange(index, 'day', parseInt(e.target.value, 10))}
                        className="form-input"
                        aria-label={`Jour ${index + 1}`}
                      >
                        {DAY_NAMES.map((day, dayIndex) => (
                          <option key={dayIndex} value={dayIndex}>{day}</option>
                        ))}
                      </select>

                      {allowMinutes ? (
                        <input
                          type="time"
                          step={timeInputStep}
                          value={range.start}
                          onChange={(e) => updateTimeRange(index, 'start', e.target.value)}
                          className="form-input"
                          aria-label={`Heure de début ${index + 1}`}
                          required
                        />
                      ) : (
                        <select
                          value={range.start}
                          onChange={(e) => updateTimeRange(index, 'start', e.target.value)}
                          className="form-input"
                          aria-label={`Heure de début ${index + 1}`}
                        >
                          {START_HOUR_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      )}

                      <span className="weekly-task-separator">à</span>

                      {allowMinutes ? (
                        <input
                          type="time"
                          step={timeInputStep}
                          value={range.end === '24:00' ? '23:59' : range.end}
                          onChange={(e) => {
                            const value = e.target.value === '23:59' && range.end === '24:00'
                              ? '24:00'
                              : e.target.value;
                            updateTimeRange(index, 'end', value);
                          }}
                          className="form-input"
                          aria-label={`Heure de fin ${index + 1}`}
                          required
                        />
                      ) : (
                        <select
                          value={range.end}
                          onChange={(e) => updateTimeRange(index, 'end', e.target.value)}
                          className="form-input"
                          aria-label={`Heure de fin ${index + 1}`}
                        >
                          {END_HOUR_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeTimeRange(index)}
                      className="weekly-task-remove"
                      disabled={task.time_ranges.length === 1}
                      aria-label={`Supprimer le créneau ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addTimeRange}
                className="btn btn-outline weekly-task-add"
              >
                + Ajouter un créneau
              </button>
            </div>

            <div className="weekly-task-meta-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="task-price">Tarif horaire</label>
                <input
                  id="task-price"
                  type="number"
                  value={task.price}
                  onChange={(e) => setTask({ ...task, price: e.target.value })}
                  placeholder="Optionnel"
                  min="0"
                  step="0.5"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="task-priority">Priorité</label>
                <select
                  id="task-priority"
                  value={task.priority}
                  onChange={(e) => setTask({ ...task, priority: normalizePriorityValue(e.target.value) })}
                  className="form-input"
                >
                  <option value="high">Importante (urgent)</option>
                  <option value="medium">Moyenne (par défaut)</option>
                  <option value="low">Faible</option>
                </select>
              </div>

              {shouldShowStatusField && (
                <div className="form-group">
                  <label className="form-label" htmlFor="task-status">Avancement</label>
                  <select
                    id="task-status"
                    value={task.status}
                    onChange={(e) =>
                      setTask({ ...task, status: normalizeStatusValue(e.target.value) })
                    }
                    className="form-input"
                  >
                    <option value="todo">À faire</option>
                    <option value="doing">En cours</option>
                    <option value="done">Terminé</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Icône</label>
                <div className="weekly-task-icon-category">
                  <label className="sr-only" htmlFor="weekly-task-icon-category">Catégorie d'icônes</label>
                  <select
                    id="weekly-task-icon-category"
                    value={selectedIconCategory}
                    onChange={handleIconCategoryChange}
                    className="form-input"
                  >
                    {TASK_ICON_CATEGORIES.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="weekly-task-icon-grid" role="list">
                  {iconOptions.map((iconKey) => {
                    const normalizedKey = resolveTaskIconKey(iconKey);
                    const isSelected = resolveTaskIconKey(task.icon) === normalizedKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        className={`weekly-task-icon-button ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => {
                          const nextIconKey = resolveTaskIconKey(iconKey);
                          setTask((current) => ({ ...current, icon: nextIconKey }));
                          const categoryKey = resolveTaskIconCategory(nextIconKey);
                          if (categoryKey) {
                            setSelectedIconCategory(categoryKey);
                          }
                        }}
                        aria-pressed={isSelected}
                        aria-label={`Icône ${normalizedKey}`}
                        title={normalizedKey}
                      >
                        <span aria-hidden>{getTaskIcon(iconKey, { className: 'h-5 w-5' })}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Couleur</label>
                <div className="weekly-task-color-grid" role="list">
                  {colorOptions.map((colorKey) => {
                    const colorStyles = getTaskColor(colorKey);
                    const isSelected = task.color === colorKey;
                    return (
                      <button
                        key={colorKey}
                        type="button"
                        className={`weekly-task-color-swatch ${isSelected ? 'is-selected' : ''}`}
                        style={{
                          backgroundColor: colorStyles.backgroundColor,
                          borderColor: colorStyles.borderColor,
                        }}
                        onClick={() => setTask({ ...task, color: colorKey })}
                        aria-pressed={isSelected}
                        aria-label={`Couleur ${getColorLabel(colorKey)}`}
                        title={getColorLabel(colorKey)}
                      >
                        <span className="sr-only">{getColorLabel(colorKey)}</span>
                      </button>
                    );
                  })}
                </div>
                <div
                  className="weekly-task-color-preview"
                  style={getTaskColor(task.color)}
                  aria-hidden="true"
                />
                <span className="weekly-task-color-label">{getColorLabel(task.color)}</span>
              </div>
            </div>
          </fieldset>

          <div className="modal-actions weekly-task-actions">
            {onDelete && initialTask && !readOnly && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => onDelete(initialTask)}
                disabled={isSubmitting}
              >
                Supprimer
              </button>
            )}

            <div className="action-group">
              <button
                type="button"
                className="btn btn-outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || readOnly}
              >
                {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </form>
      </div>
      <TaskModalStyles />
    </div>
  );
};

export default WeeklyTaskForm;
