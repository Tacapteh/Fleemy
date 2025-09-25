import React, { useState } from 'react';
import { saveTask, useFirebaseUser } from '../firebase';
import { TASK_ICON_KEYS, getTaskIcon } from '../constants/icons';
import { TASK_COLOR_KEYS, getTaskColor, DEFAULT_TASK_COLOR } from '../constants/colors';

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
    title: initialTask?.title || '',
    start: initStart,
    end: initEnd,
    color: initialTask?.color || '#10b981',
    icon: initialTask?.icon || '📋',
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

  const iconOptions = ['📋', '✅', '🎯', '💼', '📝', '🔧', '💡', '📊', '🎨', '🚀'];
  const colorOptions = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

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
                {iconOptions.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={`task-form-icon ${task.icon === icon ? 'selected' : ''}`}
                    onClick={() => setTask({ ...task, icon })}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="task-form-field">
              <label>Couleur</label>
              <div className="task-form-colors">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`task-form-color ${task.color === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setTask({ ...task, color })}
                  />
                ))}
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
          max-width: 500px;
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
        .task-form-field textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .task-form-field input:focus,
        .task-form-field textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
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

        .task-form-delete {
          background: #ef4444;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
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

        .task-form-save:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default TaskForm;