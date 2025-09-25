import React, { useState } from 'react';
import { saveWeeklyTask, useFirebaseUser } from '../firebase';
import { TASK_ICON_KEYS, getTaskIcon } from '../constants/icons';
import { TASK_COLOR_KEYS, getTaskColor, DEFAULT_TASK_COLOR } from '../constants/colors';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const WeeklyTaskForm = ({ initialTask = null, onSave, onCancel, onDelete }) => {
  const [task, setTask] = useState({
    label: initialTask?.label || '',
    price: initialTask?.price || '',
    color: initialTask?.color || DEFAULT_TASK_COLOR,
    icon: initialTask?.icon || 'briefcase',
    time_ranges: initialTask?.time_ranges || [
      { day: 0, start: '09:00', end: '10:00' } // Lundi par défaut - heures pleines
    ]
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const user = useFirebaseUser();

  const addTimeRange = () => {
    setTask({
      ...task,
      time_ranges: [
        ...task.time_ranges,
        { day: 0, start: '09:00', end: '10:00' }
      ]
    });
  };

  const updateTimeRange = (index, field, value) => {
    const newRanges = [...task.time_ranges];
    newRanges[index] = { ...newRanges[index], [field]: value };
    setTask({ ...task, time_ranges: newRanges });
  };

  const removeTimeRange = (index) => {
    if (task.time_ranges.length === 1) return; // Garder au moins un créneau
    const newRanges = task.time_ranges.filter((_, i) => i !== index);
    setTask({ ...task, time_ranges: newRanges });
  };

  const validateTimeRange = (range) => {
    if (typeof range.day !== 'number' || range.day < 0 || range.day > 6) {
      return 'Jour invalide';
    }
    
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(range.start) || !timeRegex.test(range.end)) {
      return 'Format d\'heure invalide (HH:MM)';
    }
    
    const [startH, startM] = range.start.split(':').map(Number);
    const [endH, endM] = range.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    if (startMinutes >= endMinutes) {
      return 'L\'heure de fin doit être après l\'heure de début';
    }
    
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!user) {
      setError('Utilisateur non connecté');
      return;
    }

    // Validation
    if (!task.label.trim()) {
      setError('Le libellé est requis');
      return;
    }

    if (task.time_ranges.length === 0) {
      setError('Au moins un créneau horaire est requis');
      return;
    }

    // Valider chaque créneau
    for (let i = 0; i < task.time_ranges.length; i++) {
      const error = validateTimeRange(task.time_ranges[i]);
      if (error) {
        setError(`Créneau ${i + 1}: ${error}`);
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

      const savedTask = await saveWeeklyTask(taskData);
      
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

  const iconOptions = TASK_ICON_KEYS.slice(0, 20); // Afficher les 20 premiers
  const colorOptions = TASK_COLOR_KEYS;

  if (!user) {
    return <div>Chargement...</div>;
  }

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
            />
            <small id="task-label-help">Ce nom apparaîtra dans votre planning</small>
          </div>

          <div className="task-form-field">
            <label>Créneaux horaires *</label>
            <div className="time-ranges-list">
              {task.time_ranges.map((range, index) => (
                <div key={index} className="time-range-item">
                  <div className="time-range-controls">
                    <select
                      value={range.day}
                      onChange={(e) => updateTimeRange(index, 'day', parseInt(e.target.value))}
                      className="day-select"
                      aria-label={`Jour ${index + 1}`}
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
                    />
                    
                    <span className="time-separator">à</span>
                    
                    <input
                      type="time"
                      value={range.end}
                      onChange={(e) => updateTimeRange(index, 'end', e.target.value)}
                      className="time-input"
                      aria-label={`Heure de fin ${index + 1}`}
                    />
                    
                    {task.time_ranges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTimeRange(index)}
                        className="remove-range-btn"
                        aria-label={`Supprimer le créneau ${index + 1}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <button
              type="button"
              onClick={addTimeRange}
              className="add-range-btn"
            >
              + Ajouter un créneau
            </button>
          </div>

          <div className="task-form-row">
            <div className="task-form-field">
              <label>Icône</label>
              <div className="task-form-icons">
                {iconOptions.map((iconKey) => (
                  <button
                    key={iconKey}
                    type="button"
                    className={`task-form-icon ${task.icon === iconKey ? 'selected' : ''}`}
                    onClick={() => setTask({ ...task, icon: iconKey })}
                    title={iconKey}
                    aria-label={`Icône ${iconKey}`}
                  >
                    {getTaskIcon(iconKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="task-form-field">
              <label>Couleur</label>
              <div className="task-form-colors">
                {colorOptions.map((colorKey) => {
                  const colorStyles = getTaskColor(colorKey);
                  return (
                    <button
                      key={colorKey}
                      type="button"
                      className={`task-form-color ${task.color === colorKey ? 'selected' : ''}`}
                      style={{ backgroundColor: colorStyles.backgroundColor }}
                      onClick={() => setTask({ ...task, color: colorKey })}
                      title={colorKey}
                      aria-label={`Couleur ${colorKey}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="task-form-field">
            <label htmlFor="task-price">Prix par occurrence (optionnel)</label>
            <input
              id="task-price"
              type="number"
              step="0.01"
              min="0"
              value={task.price}
              onChange={(e) => setTask({ ...task, price: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div className="task-form-actions">
            <button
              type="button"
              onClick={onCancel}
              className="task-form-cancel"
            >
              Annuler
            </button>
            {initialTask && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(initialTask.id)}
                className="task-form-delete"
              >
                Supprimer
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="task-form-save"
            >
              {isSubmitting ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .task-form-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .task-form-modal {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }

        .task-form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .task-form-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .task-form-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
          padding: 4px;
          border-radius: 4px;
        }

        .task-form-close:hover {
          background: #f3f4f6;
        }

        .task-form {
          padding: 20px;
        }

        .task-form-error {
          background: #fee2e2;
          color: #991b1b;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          border: 1px solid #fecaca;
        }

        .task-form-field {
          margin-bottom: 16px;
        }

        .task-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .task-form-field label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          color: #374151;
        }

        .task-form-field input,
        .task-form-field select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .task-form-field input:focus,
        .task-form-field select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .task-form-field small {
          display: block;
          margin-top: 4px;
          color: #6b7280;
          font-size: 12px;
        }

        .time-ranges-list {
          margin-bottom: 12px;
        }

        .time-range-item {
          margin-bottom: 8px;
        }

        .time-range-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          background: #f9fafb;
          border-radius: 6px;
        }

        .day-select {
          flex: 2;
          min-width: 0;
        }

        .time-input {
          flex: 1;
          min-width: 80px;
        }

        .time-separator {
          color: #6b7280;
          font-size: 14px;
        }

        .remove-range-btn {
          background: #ef4444;
          color: white;
          border: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          flex-shrink: 0;
        }

        .remove-range-btn:hover {
          background: #dc2626;
        }

        .add-range-btn {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .add-range-btn:hover {
          background: #e5e7eb;
        }

        .task-form-icons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .task-form-icon {
          background: #f3f4f6;
          border: 2px solid transparent;
          border-radius: 6px;
          padding: 8px;
          cursor: pointer;
          font-size: 16px;
        }

        .task-form-icon.selected {
          border-color: #3b82f6;
          background: #dbeafe;
        }

        .task-form-icon:hover {
          background: #e5e7eb;
        }

        .task-form-colors {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .task-form-color {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid transparent;
          cursor: pointer;
        }

        .task-form-color.selected {
          border-color: #374151;
        }

        .task-form-color:hover {
          transform: scale(1.1);
        }

        .task-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }

        .task-form-cancel {
          background: #f3f4f6;
          color: #374151;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .task-form-cancel:hover {
          background: #e5e7eb;
        }

        .task-form-delete {
          background: #ef4444;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .task-form-delete:hover {
          background: #dc2626;
        }

        .task-form-save {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .task-form-save:hover {
          background: #2563eb;
        }

        .task-form-save:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .task-form-row {
            grid-template-columns: 1fr;
          }
          
          .time-range-controls {
            flex-wrap: wrap;
          }
          
          .day-select {
            flex: 1 1 100%;
            margin-bottom: 4px;
          }
        }
      `}</style>
    </div>
  );
};

export default WeeklyTaskForm;