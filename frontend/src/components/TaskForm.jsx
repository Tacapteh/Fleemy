import React, { useMemo, useState } from 'react';
import { saveTask, useFirebaseUser } from '../firebase';
import {
  TASK_ICON_CATEGORIES,
  getTaskIcon,
  resolveTaskIconCategory,
  resolveTaskIconKey,
} from '../constants/icons';
import { TASK_COLOR_KEYS, getTaskColor, DEFAULT_TASK_COLOR } from '../constants/colors';
import TaskModalStyles from './TaskModalStyles';
import { readTaskClipboard, writeTaskClipboard } from '../utils/taskClipboard';

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
  const initialIconValue = initialTask?.icon || 'briefcase';
  const defaultIconKey = resolveTaskIconKey(initialIconValue);
  const defaultIconCategory =
    resolveTaskIconCategory(initialIconValue) || TASK_ICON_CATEGORIES[0]?.key || 'work_general';

  const [task, setTask] = useState({
    title: initialTask?.title || initialTask?.label || '',
    start: initStart,
    end: initEnd,
    color: initialTask?.color || DEFAULT_TASK_COLOR,
    icon: defaultIconKey,
    price: initialTask?.price || '',
    description: initialTask?.description || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedIconCategory, setSelectedIconCategory] = useState(defaultIconCategory);
  const [clipboardItem, setClipboardItem] = useState(() => readTaskClipboard());
  const user = useFirebaseUser();

  const isNegativePrice = useMemo(() => {
    if (typeof task.price === 'string') {
      return task.price.trim().startsWith('-');
    }
    if (task.price == null) {
      return false;
    }
    return Number(task.price) < 0;
  }, [task.price]);

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
      const normalizedPrice = (() => {
        const rawPrice = typeof task.price === 'string' ? task.price.trim() : task.price;
        if (rawPrice === '' || rawPrice === null || rawPrice === undefined || rawPrice === '-') {
          return null;
        }
        const parsed = Number.parseFloat(rawPrice);
        return Number.isFinite(parsed) ? parsed : null;
      })();

      const taskData = {
        ...task,
        id: initialTask?.id || undefined,
        start: startDate,
        end: endDate,
        price: normalizedPrice,
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

  const activeCategory =
    TASK_ICON_CATEGORIES.find((category) => category.key === selectedIconCategory) ||
    TASK_ICON_CATEGORIES[0];

  let iconOptions = activeCategory ? Object.keys(activeCategory.icons) : [];
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

  const handleCopy = () => {
    const clipboard = {
      type: 'task',
      payload: {
        ...task,
        start: task.start instanceof Date ? task.start.toISOString() : task.start,
        end: task.end instanceof Date ? task.end.toISOString() : task.end
      }
    };
    writeTaskClipboard(clipboard);
    setClipboardItem(clipboard);
  };

  const handlePaste = () => {
    if (!clipboardItem || clipboardItem.type !== 'task' || !clipboardItem.payload) {
      return;
    }

    const payload = clipboardItem.payload;
    const parsedStart = payload.start ? new Date(payload.start) : task.start;
    const parsedEnd = payload.end ? new Date(payload.end) : task.end;

    setTask((current) => ({
      ...current,
      title: payload.title || payload.label || current.title,
      description: payload.description || current.description,
      color: payload.color || current.color,
      icon: resolveTaskIconKey(payload.icon || current.icon),
      price: payload.price ?? payload.amount ?? payload.total ?? current.price,
      start: Number.isNaN(parsedStart?.getTime()) ? current.start : parsedStart,
      end: Number.isNaN(parsedEnd?.getTime()) ? current.end : parsedEnd
    }));
  };

  if (!user) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="task-form-overlay">
      <div className="task-form-modal">
        <div className="task-form-header">
          <h3>{initialTask ? 'Modifier la tâche' : 'Nouvelle tâche'}</h3>
          <div className="task-form-header-actions">
            <button
              type="button"
              className="task-form-clipboard"
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
              className="task-form-clipboard"
              onClick={handlePaste}
              title="Coller la tâche copiée"
              aria-label="Coller la tâche copiée"
              disabled={!clipboardItem || clipboardItem.type !== 'task'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M7 8.5H6a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h9" />
                <path d="M10 3h5.5L20.5 8v11a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
                <path d="M15.5 3v5h5" />
                <path d="M11.5 11.5h6" />
                <path d="M11.5 15h6" />
                <path d="M11.5 18.5h3.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="task-form-close"
            >
              ×
            </button>
          </div>
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
              <div className="task-form-icon-category">
                <label className="sr-only" htmlFor="task-icon-category">Catégorie d'icônes</label>
                <select
                  id="task-icon-category"
                  value={selectedIconCategory}
                  onChange={handleIconCategoryChange}
                >
                  {TASK_ICON_CATEGORIES.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="task-form-icons">
                {iconOptions.map((iconKey) => {
                  const normalizedKey = resolveTaskIconKey(iconKey);
                  const isSelected = resolveTaskIconKey(task.icon) === normalizedKey;

                  return (
                    <button
                      key={iconKey}
                      type="button"
                      className={`task-form-icon ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        const nextIconKey = resolveTaskIconKey(iconKey);
                        setTask((current) => ({ ...current, icon: nextIconKey }));
                        const categoryKey = resolveTaskIconCategory(nextIconKey);
                        if (categoryKey) {
                          setSelectedIconCategory(categoryKey);
                        }
                      }}
                      title={normalizedKey}
                    >
                      {getTaskIcon(iconKey, { className: 'h-5 w-5' })}
                    </button>
                  );
                })}
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
              value={task.price}
              onChange={(e) => setTask({ ...task, price: e.target.value })}
              placeholder="0.00"
            />
            {isNegativePrice && (
              <span className="task-form-hint">montant négatif</span>
            )}
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
