import React, { useState } from 'react';
import { saveWeeklyTask } from '../firebase';
import { TASK_ICON_KEYS } from '../constants/icons';
import { TASK_COLOR_KEYS, getTaskColor, DEFAULT_TASK_COLOR } from '../constants/colors';
import TaskModalStyles from './TaskModalStyles';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const WeeklyTaskForm = ({ initialTask = null, onSave, onCancel, onDelete, context, readOnly = false }) => {
  const [task, setTask] = useState({
    label: initialTask?.label || '',
    price: initialTask?.price || '',
    color: initialTask?.color || DEFAULT_TASK_COLOR,
    icon: initialTask?.icon || 'briefcase',
    time_ranges: initialTask?.time_ranges || [
      { day: 0, start: '09:00', end: '10:00' }
    ]
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addTimeRange = () => {
    setTask((current) => ({
      ...current,
      time_ranges: [
        ...current.time_ranges,
        { day: 0, start: '09:00', end: '10:00' }
      ]
    }));
  };

  const updateTimeRange = (index, field, value) => {
    const newRanges = [...task.time_ranges];

    if (field === 'start' || field === 'end') {
      const timeParts = value.split(':');
      if (timeParts.length === 2) {
        value = `${timeParts[0]}:00`;
      }
    }

    newRanges[index] = { ...newRanges[index], [field]: value };
    setTask({ ...task, time_ranges: newRanges });
  };

  const removeTimeRange = (index) => {
    if (task.time_ranges.length === 1) return;
    const newRanges = task.time_ranges.filter((_, i) => i !== index);
    setTask({ ...task, time_ranges: newRanges });
  };

  const validateTimeRange = (range) => {
    if (typeof range.day !== 'number' || range.day < 0 || range.day > 6) {
      return 'Jour invalide';
    }

    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(range.start) || !timeRegex.test(range.end)) {
      return "Format d'heure invalide (HH:MM)";
    }

    const [startH, startM] = range.start.split(':').map(Number);
    const [endH, endM] = range.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

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
      const taskData = {
        ...task,
        id: initialTask?.id || undefined,
        price: task.price ? parseFloat(task.price) : null,
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

  const iconOptions = TASK_ICON_KEYS.slice(0, 20);
  const colorOptions = TASK_COLOR_KEYS;

  return (
    <div className="task-form-overlay">
      <div className="task-form-modal">
        <div className="task-form-header">
          <h3>{initialTask ? 'Modifier la tâche hebdomadaire' : 'Nouvelle tâche hebdomadaire'}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="task-form-close"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          {readOnly && (
            <div className="task-form-info" role="note">
              Vous consultez ce planning en lecture seule.
            </div>
          )}

          {error && (
            <div className="task-form-error" role="alert">
              {error}
            </div>
          )}

          <div className="task-form-field">
            <label htmlFor="task-label">Libellé *</label>
            <input
              id="task-label"
              type="text"
              value={task.label}
              onChange={(e) => setTask({ ...task, label: e.target.value })}
              placeholder="Nom de la tâche"
              required
              aria-describedby="task-label-help"
              disabled={readOnly || isSubmitting}
            />
            <small id="task-label-help">Ce nom apparaîtra dans votre planning</small>
          </div>

          <div className="task-form-field">
            <label>Créneaux horaires * <small>(heures pleines uniquement)</small></label>
            <div className="time-ranges-list">
              {task.time_ranges.map((range, index) => (
                <div key={index} className="time-range-item">
                  <div className="time-range-controls">
                    <select
                      value={range.day}
                      onChange={(e) => updateTimeRange(index, 'day', parseInt(e.target.value, 10))}
                      className="day-select"
                      aria-label={`Jour ${index + 1}`}
                      disabled={readOnly || isSubmitting}
                    >
                      {DAY_NAMES.map((day, dayIndex) => (
                        <option key={dayIndex} value={dayIndex}>{day}</option>
                      ))}
                    </select>

                    <input
                      type="time"
                      value={range.start}
                      onChange={(e) => updateTimeRange(index, 'start', e.target.value)}
                      className="time-input"
                      aria-label={`Heure de début ${index + 1}`}
                      step="3600"
                      min="00:00"
                      max="23:00"
                      disabled={readOnly || isSubmitting}
                    />

                    <span className="time-separator">à</span>

                    <input
                      type="time"
                      value={range.end}
                      onChange={(e) => updateTimeRange(index, 'end', e.target.value)}
                      className="time-input"
                      aria-label={`Heure de fin ${index + 1}`}
                      step="3600"
                      min="01:00"
                      max="24:00"
                      disabled={readOnly || isSubmitting}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeTimeRange(index)}
                    className="remove-range"
                    disabled={task.time_ranges.length === 1 || readOnly || isSubmitting}
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
              className="add-range"
              disabled={readOnly || isSubmitting}
            >
              + Ajouter un créneau
            </button>
          </div>

          <div className="task-form-grid">
            <div className="task-form-field">
              <label htmlFor="task-price">Tarif horaire</label>
              <input
                id="task-price"
                type="number"
                value={task.price}
                onChange={(e) => setTask({ ...task, price: e.target.value })}
                placeholder="Optionnel"
                min="0"
                step="0.5"
                disabled={readOnly || isSubmitting}
              />
            </div>

            <div className="task-form-field">
              <label>Icône</label>
              <select
                value={task.icon}
                onChange={(e) => setTask({ ...task, icon: e.target.value })}
                disabled={readOnly || isSubmitting}
              >
                {iconOptions.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </div>

            <div className="task-form-field">
              <label>Couleur</label>
              <select
                value={task.color}
                onChange={(e) => setTask({ ...task, color: e.target.value })}
                disabled={readOnly || isSubmitting}
              >
                {colorOptions.map((colorKey) => (
                  <option key={colorKey} value={colorKey}>
                    {colorKey}
                  </option>
                ))}
              </select>
              <div
                className="color-preview"
                style={getTaskColor(task.color)}
              />
            </div>
          </div>

          <div className="task-form-actions">
            {onDelete && initialTask && !readOnly && (
              <button
                type="button"
                className="task-form-delete"
                onClick={() => onDelete(initialTask)}
                disabled={isSubmitting}
              >
                Supprimer
              </button>
            )}

            <div className="task-form-actions-right">
              <button
                type="button"
                className="task-form-cancel"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="task-form-submit"
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
