import React, { useState } from 'react';
import { saveTask, useFirebaseUser } from '../firebase';
import { TASK_ICON_KEYS, getTaskIcon } from '../constants/icons';
import { TASK_COLOR_KEYS, getTaskColor, DEFAULT_TASK_COLOR } from '../constants/colors';
import TaskModalStyles from './TaskModalStyles';

const roundToHour = (date = new Date()) => {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
};

const TaskForm = ({ initialTask = null, onSave, onCancel, onDelete }) => {
  const initStart = initialTask?.start ? new Date(initialTask.start) : roundToHour();
  const initEnd = initialTask?.end
    ? new Date(initialTask.end)
    : new Date(initStart.getTime() + 60 * 60 * 1000);
  const [task, setTask] = useState({
    title: initialTask?.title || initialTask?.label || '',
    start: initStart,
    end: initEnd,
    color: initialTask?.color || DEFAULT_TASK_COLOR,
    icon: initialTask?.icon || 'briefcase',
    price: initialTask?.price || '',
    description: initialTask?.description || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const user = useFirebaseUser();

  const formatDateTimeLocal = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!user) {
      setError('Utilisateur non connecté');
      return;
    }

    // Validation
    if (!task.title.trim()) {
      setError('Le titre est requis');
      return;
    }

    const startDate = new Date(task.start);
    const endDate = new Date(task.end);
    startDate.setMinutes(0, 0, 0);
    endDate.setMinutes(0, 0, 0);

    if (startDate >= endDate) {
      setError('La date de fin doit être après la date de début');
      return;
    }

    setIsSubmitting(true);

    try {
      const taskData = {
        ...task,
        id: initialTask?.id || undefined,
        start: startDate,
        end: endDate,
        price: task.price ? parseFloat(task.price) : null,
        user_id: user.uid
      };

      const savedTask = await saveTask(taskData);
      
      if (onSave) {
        onSave(savedTask);
      }
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err);
      setError('Erreur lors de la sauvegarde de la tâche');
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
          <h3>{initialTask ? 'Modifier la tâche' : 'Nouvelle tâche'}</h3>
          <button 
            type="button" 
            onClick={onCancel}
            className="task-form-close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          {error && (
            <div className="task-form-error">
              {error}
            </div>
          )}

          <div className="task-form-field">
            <label htmlFor="task-title">Titre *</label>
            <input
              id="task-title"
              type="text"
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
              placeholder="Nom de la tâche"
              required
            />
          </div>

          <div className="task-form-row">
            <div className="task-form-field">
              <label htmlFor="task-start">Début *</label>
              <input
                id="task-start"
                type="datetime-local"
                value={formatDateTimeLocal(task.start)}
                onChange={(e) => setTask({ ...task, start: new Date(e.target.value) })}
                step="3600"
                required
              />
            </div>

            <div className="task-form-field">
              <label htmlFor="task-end">Fin *</label>
              <input
                id="task-end"
                type="datetime-local"
                value={formatDateTimeLocal(task.end)}
                onChange={(e) => setTask({ ...task, end: new Date(e.target.value) })}
                step="3600"
                required
              />
            </div>
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
                      style={{
                        backgroundColor: colorStyles.backgroundColor,
                        borderColor: colorStyles.borderColor
                      }}
                      onClick={() => setTask({ ...task, color: colorKey })}
                      title={colorKey}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="task-form-field">
            <label htmlFor="task-price">Prix (optionnel)</label>
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

          <div className="task-form-field">
            <label htmlFor="task-description">Description</label>
            <textarea
              id="task-description"
              value={task.description}
              onChange={(e) => setTask({ ...task, description: e.target.value })}
              placeholder="Description de la tâche..."
              rows={3}
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
      <TaskModalStyles />
    </div>
  );
};

export default TaskForm;
