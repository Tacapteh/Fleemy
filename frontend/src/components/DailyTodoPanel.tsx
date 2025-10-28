import React, { useState, useMemo, useCallback } from 'react';
import { Trash2, Plus, Clock, Flame, Smile, Bed } from 'lucide-react';
import useDailyTodos from '../hooks/useDailyTodos';
import type { TodoItem } from '../types/todo';
import { useSettings } from '../context/SettingsContext';
import PriorityNumberBadge from '../ui/PriorityNumberBadge';
import { TaskTodoIcon, TaskDoingIcon, TaskDoneIcon } from './icons/TaskStatusIcons';
import CardSection from '../ui/CardSection';
import StatusChip from '../ui/StatusChip';

interface DailyTodoPanelProps {
  selectedDate: string | Date; // "YYYY-MM-DD" or Date object
  userId: string;
  readOnly?: boolean;
  teamId?: string | null;
  compact?: boolean;
}

const toDateString = (value: string | Date): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
};

const resolvePriority = (
  value: TodoItem['priority'],
): 'high' | 'medium' | 'low' => {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'medium';
};

type StatusKey = 'todo' | 'doing' | 'done';

interface StatusDisplayConfig {
  label: string;
  srLabel: string;
  iconComponent: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconClass: string;
  chipClass: string;
}

const PRIMARY_ACTION_BUTTON_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-colors transition-shadow duration-150 hover:bg-blue-400 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-slate-900 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-lg disabled:hover:bg-blue-500';

const STATUS_DISPLAY: Record<StatusKey, StatusDisplayConfig> = {
  todo: {
    label: 'À faire',
    srLabel: 'Tâche à faire',
    iconComponent: TaskTodoIcon,
    iconClass: 'text-slate-400 dark:text-slate-300',
    chipClass: 'bg-slate-500/10 text-slate-300 border border-slate-500/30 dark:bg-slate-500/20 dark:text-slate-200 dark:border-slate-500/40',
  },
  doing: {
    label: 'En cours',
    srLabel: 'Tâche en cours',
    iconComponent: TaskDoingIcon,
    iconClass: 'text-amber-300',
    chipClass: 'bg-amber-500/10 text-amber-300 border border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40',
  },
  done: {
    label: 'Terminé',
    srLabel: 'Tâche terminée',
    iconComponent: TaskDoneIcon,
    iconClass: 'text-emerald-400',
    chipClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
  },
};

const PRIORITY_ORDER: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export default function DailyTodoPanel({
  selectedDate,
  userId,
  readOnly = false,
  teamId = null,
  compact = false,
}: DailyTodoPanelProps) {
  const dateStr = useMemo(() => toDateString(selectedDate), [selectedDate]);

  const { todos, loading, error, readOnly: isReadOnly, addItem, updateItem, deleteItem } = useDailyTodos({
    userId,
    date: dateStr,
    teamId,
    enabled: Boolean(userId && dateStr),
  });

  const settingsContext = useSettings();
  const showTaskStatusBadges = settingsContext?.showTaskStatusBadges !== false;
  const showTaskPriorityBadges = settingsContext?.showTaskPriorityBadges !== false;

  const [newText, setNewText] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTime, setEditTime] = useState('');

  const effectiveReadOnly = readOnly || isReadOnly;

  const sortedItems = useMemo(() => {
    if (!todos?.items) {
      return [];
    }

    const withIndex = todos.items.map((item, index) => ({ item, index }));

    const sortByPriorityAndTime = (
      a: { item: TodoItem; index: number },
      b: { item: TodoItem; index: number },
    ) => {
      const priorityA = PRIORITY_ORDER[resolvePriority(a.item.priority)];
      const priorityB = PRIORITY_ORDER[resolvePriority(b.item.priority)];
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const aTime = a.item.time || '';
      const bTime = b.item.time || '';

      if (aTime && bTime) {
        const comparison = aTime.localeCompare(bTime);
        if (comparison !== 0) {
          return comparison;
        }
      } else if (aTime || bTime) {
        return aTime ? -1 : 1;
      }

      return a.index - b.index;
    };

    const undone = withIndex
      .filter(({ item }) => !item.done)
      .sort(sortByPriorityAndTime)
      .map(({ item }) => item);

    const done = withIndex
      .filter(({ item }) => item.done)
      .sort(sortByPriorityAndTime)
      .map(({ item }) => item);

    return [...undone, ...done];
  }, [todos?.items]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || effectiveReadOnly) {
      return;
    }

    try {
      await addItem(newText.trim(), newTime || null, newPriority);
      setNewText('');
      setNewTime('');
    } catch (err) {
      console.error('Failed to add todo item', err);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (effectiveReadOnly) {
      return;
    }

    try {
      await deleteItem(itemId);
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  };

  const toggleTaskDone = useCallback(
    async (itemId: string, currentStatus: StatusKey) => {
      if (effectiveReadOnly) {
        return;
      }

      const nextStatus = currentStatus === 'done' ? 'todo' : 'done';

      try {
        await updateItem(itemId, {
          status: nextStatus,
          done: nextStatus === 'done',
        });
      } catch (err) {
        console.error('Failed to toggle task status', err);
      }
    },
    [effectiveReadOnly, updateItem]
  );

  const startEdit = (item: TodoItem) => {
    if (effectiveReadOnly) {
      return;
    }
    setEditingId(item.id);
    setEditText(item.text);
    setEditTime(item.time || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditTime('');
  };

  const saveEdit = async (itemId: string) => {
    if (effectiveReadOnly || !editText.trim()) {
      cancelEdit();
      return;
    }

    try {
      await updateItem(itemId, {
        text: editText.trim(),
        time: editTime || null,
      });
      cancelEdit();
    } catch (err) {
      console.error('Failed to update item', err);
    }
  };

  if (loading) {
    return (
      <CardSection
        variant="note"
        icon={<Clock className="h-5 w-5" />}
        title="À ne pas oublier"
        data-testid="daily-todo-loading"
      >
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-amber-300">Chargement...</p>
        </div>
      </CardSection>
    );
  }

  if (error) {
    return (
      <CardSection
        variant="warning"
        icon={<Clock className="h-5 w-5" />}
        title="À ne pas oublier"
        data-testid="daily-todo-error"
      >
        <p className="text-sm text-red-300">{error}</p>
      </CardSection>
    );
  }

  return (
    <CardSection
      variant="note"
      icon={<Clock className="h-5 w-5" />}
      title="À ne pas oublier"
      subtitle={effectiveReadOnly ? 'Lecture seule' : undefined}
      data-testid="daily-todo-panel"
    >
      {/* Add new item form */}
      {!effectiveReadOnly && (
        <form onSubmit={handleAdd} className="mb-4 space-y-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Nouvelle note..."
            data-testid="todo-input-text"
            className="w-full rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 shadow-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[140px] sm:flex-none">
              <label htmlFor="daily-todo-priority" className="sr-only">
                Priorité
              </label>
              <select
                id="daily-todo-priority"
                value={newPriority}
                onChange={(event) =>
                  setNewPriority(event.target.value as 'high' | 'medium' | 'low')
                }
                className="w-full rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 shadow-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                aria-label="Priorité"
              >
                <option value="high">Importante</option>
                <option value="medium">Moyenne</option>
                <option value="low">Faible</option>
              </select>
            </div>
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              data-testid="todo-input-time"
              className="rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 shadow-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              aria-label="Heure limite (optionnel)"
            />
            <button
              type="submit"
              disabled={!newText.trim()}
              data-testid="todo-add-button"
              className={PRIMARY_ACTION_BUTTON_CLASSES}
              aria-label="Ajouter une note"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          </div>
        </form>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {sortedItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            Rien à noter pour le moment
          </p>
        ) : (
          sortedItems.map((item) => {
            const normalizedStatus =
              item.status === 'todo' || item.status === 'doing' || item.status === 'done'
                ? item.status
                : (item.done ? 'done' : 'todo');
            const statusKey: StatusKey = normalizedStatus;
            const statusDisplay = STATUS_DISPLAY[statusKey];
            const StatusIcon = statusDisplay.iconComponent;
            const resolvedPriority = resolvePriority(item.priority);

            return (
              <div
                key={item.id}
                data-testid={`todo-item-${item.id}`}
                className={`flex items-center gap-3 rounded-xl border bg-slate-800/40 p-3 shadow-md transition-colors transition-opacity transition-shadow duration-200 focus-within:ring-2 focus-within:ring-amber-400/30 focus-within:ring-offset-0 ${
                  item.done
                    ? 'border-slate-700/30 opacity-60'
                    : 'border-slate-700/50 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-900/20'
                }`}
              >
                <div className="flex-1 min-w-0">
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      data-testid={`todo-edit-text-${item.id}`}
                      className="w-full rounded border border-slate-600 bg-slate-800/50 px-2 py-1 text-sm text-slate-100"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        data-testid={`todo-edit-time-${item.id}`}
                        className="rounded border border-slate-600 bg-slate-800/50 px-2 py-1 text-sm text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(item.id)}
                        className="inline-flex items-center rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-blue-900/30 transition-colors transition-shadow duration-150 hover:bg-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-slate-900 active:opacity-90"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="inline-flex items-center rounded-md bg-slate-600 px-3 py-1 text-xs font-semibold text-slate-100 shadow-sm transition-colors duration-150 hover:bg-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-slate-900 active:opacity-90"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {showTaskStatusBadges && (
                      <button
                        type="button"
                        onClick={() => toggleTaskDone(item.id, statusKey)}
                        disabled={effectiveReadOnly}
                        className="inline-flex items-center gap-1 rounded-md bg-transparent p-0 text-xs font-medium transition-colors transition-opacity duration-150 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60 active:opacity-90"
                        aria-label={
                          statusKey === 'done'
                            ? 'Marquer la tâche comme à faire'
                            : 'Marquer la tâche comme terminée'
                        }
                        aria-pressed={statusKey === 'done'}
                        data-testid={`todo-status-toggle-${item.id}`}
                      >
                        <StatusChip
                          statusKey={statusKey}
                          label={statusDisplay.label}
                          srLabel={statusDisplay.srLabel}
                          icon={<StatusIcon className="h-3 w-3" />}
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => !effectiveReadOnly && startEdit(item)}
                      disabled={effectiveReadOnly}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1 text-left transition-colors transition-opacity duration-200 hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {item.time && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300 transition-colors duration-150">
                            <Clock className="h-3 w-3" />
                            {item.time}
                          </span>
                        )}
                        <span
                          className={`min-w-0 text-sm transition-colors transition-opacity duration-200 ${
                            item.done
                              ? 'flex-1 text-slate-400 line-through opacity-70'
                              : 'flex-1 text-slate-100'
                          }`}
                        >
                          {item.text}
                        </span>
                      </div>
                      {showTaskPriorityBadges && (
                        <div className="flex-shrink-0">
                          <PriorityNumberBadge priority={resolvedPriority} show />
                        </div>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Delete button */}
              {!effectiveReadOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  data-testid={`todo-delete-${item.id}`}
                  className="mt-1 rounded-lg p-1.5 text-red-400 transition-colors transition-shadow duration-150 hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 active:scale-95"
                  aria-label={`Supprimer "${item.text}"`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              </div>
            );
          })
        )}
      </div>
    </CardSection>
  );
}
