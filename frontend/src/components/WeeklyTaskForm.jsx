import React, { useState } from 'react';
import { saveWeeklyTask } from '../firebase';
import { TASK_ICON_KEYS, getTaskIcon } from '../constants/icons';
import {
  TASK_COLOR_KEYS,
  getTaskColor,
  DEFAULT_TASK_COLOR,
  PASTEL_COLORS,
} from '../constants/colors';
import TaskModalStyles from './TaskModalStyles';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const DEFAULT_TIME_RANGE = { day: 0, start: '09:00', end: '10:00' };
const START_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  `${String(index).padStart(2, '0')}:00`
);
const END_HOUR_OPTIONS = [...START_HOUR_OPTIONS.slice(1), '24:00'];

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

const normalizeHourValue = (value, { allowEndOfDay = false } = {}) => {
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

  if (allowEndOfDay && hours === 24) {
    if (minutes === 0) {
      return '24:00';
    }
    return null;
  }

  if (hours < 0 || hours > 23) {
    return null;
  }

  if (minutes < 0 || minutes > 59) {
    return null;
  }

  const normalizedMinutes = 0;

  return `${String(hours).padStart(2, '0')}:${String(normalizedMinutes).padStart(2, '0')}`;
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

const normalizeTimeRange = (range, { adjustEndIfNeeded = false } = {}) => {
  if (!range) {
    return null;
  }

  const day = toDayIndex(range.day ?? range.dayIndex ?? range.weekday);
  const start = normalizeHourValue(range.start);
  const end = normalizeHourValue(range.end, { allowEndOfDay: true });

  if (day == null || !start || !end) {
    return null;
  }

  const startMinutes = timeStringToMinutes(start);
  const endMinutes = timeStringToMinutes(end);

  if (startMinutes == null || endMinutes == null) {
    return null;
  }

  let finalEndMinutes = endMinutes;
  if (endMinutes <= startMinutes) {
    if (!adjustEndIfNeeded) {
      return null;
    }
    finalEndMinutes = Math.min(startMinutes + 60, 24 * 60);
    if (finalEndMinutes <= startMinutes) {
      return null;
    }
  }

  const finalEnd =
    finalEndMinutes === endMinutes
      ? end
      : `${String(Math.floor(finalEndMinutes / 60)).padStart(2, '0')}:00`;

  return { day, start, end: finalEnd };
};

const ensureTimeRanges = (ranges) => {
  if (!Array.isArray(ranges)) {
    return [createDefaultTimeRange()];
  }

  const normalized = ranges
    .map((range) => normalizeTimeRange(range, { adjustEndIfNeeded: true }))
    .filter(Boolean);
  if (!normalized.length) {
    return [createDefaultTimeRange()];
  }
  return normalized;
};

const WeeklyTaskForm = ({ initialTask = null, onSave, onCancel, onDelete, context, readOnly = false }) => {
  const [task, setTask] = useState(() => ({
    label: initialTask?.label || '',
    price:
      initialTask?.price != null && initialTask.price !== ''
        ? String(initialTask.price)
        : '',
    color: initialTask?.color || DEFAULT_TASK_COLOR,
    icon: initialTask?.icon || 'briefcase',
    time_ranges: ensureTimeRanges(initialTask?.time_ranges),
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

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
          const startValue = normalizeHourValue(value);
          if (!startValue) {
            return range;
          }
          return { ...range, start: startValue };
        }

        if (field === 'end') {
          const endValue = normalizeHourValue(value, { allowEndOfDay: true });
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

    const start = normalizeHourValue(range.start);
    if (!start) {
      return "Format d'heure invalide (heures pleines uniquement)";
    }

    const end = normalizeHourValue(range.end, { allowEndOfDay: true });
    if (!end) {
      return "Format d'heure invalide (heures pleines uniquement)";
    }

    const startMinutes = timeStringToMinutes(start);
    const endMinutes = timeStringToMinutes(end);

    if (startMinutes == null || endMinutes == null) {
      return "Format d'heure invalide (heures pleines uniquement)";
    }

    if (startMinutes >= endMinutes) {
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
        .map((range) => normalizeTimeRange(range))
        .filter(Boolean);
      if (!sanitizedRanges.length) {
        setError('Au moins un créneau horaire valide est requis');
        setIsSubmitting(false);
        return;
      }

      let priceValueRaw = '';
      if (typeof task.price === 'string') {
        priceValueRaw = task.price;
      } else if (task.price != null) {
        priceValueRaw = String(task.price);
      }
      const priceValue = priceValueRaw.trim();
      const taskData = {
        ...task,
        time_ranges: sanitizedRanges,
        id: initialTask?.id || undefined,
        price: priceValue ? parseFloat(priceValue) : null,
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

  const iconOptions = TASK_ICON_KEYS.slice(0, 24);
  const colorOptions = TASK_COLOR_KEYS;

  const getColorLabel = (colorKey) => PASTEL_COLORS[colorKey]?.name || colorKey;

  return (
    <div className="modal-overlay weekly-task-overlay">
      <div className="modal-content weekly-task-modal">
        <div className="weekly-task-header">
          <h2>{initialTask ? 'Modifier la tâche hebdomadaire' : 'Nouvelle tâche hebdomadaire'}</h2>
        </div>

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
                <span className="weekly-task-hint-inline"> (heures pleines uniquement)</span>
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

                      <span className="weekly-task-separator">à</span>

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
                <label className="form-label">Icône</label>
                <div className="weekly-task-icon-grid" role="list">
                  {iconOptions.map((iconKey) => {
                    const isSelected = task.icon === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        className={`weekly-task-icon-button ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setTask({ ...task, icon: iconKey })}
                        aria-pressed={isSelected}
                        aria-label={`Icône ${iconKey}`}
                        title={iconKey}
                      >
                        <span aria-hidden>{getTaskIcon(iconKey)}</span>
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
