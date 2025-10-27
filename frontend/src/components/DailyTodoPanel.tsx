import React, { useState, useMemo, useCallback } from 'react';
import { Trash2, Plus, Clock } from 'lucide-react';
import useDailyTodos from '../hooks/useDailyTodos';
import type { TodoItem } from '../types/todo';
import { useSettings } from '../context/SettingsContext';
import PriorityNumberBadge from './PriorityNumberBadge';
import { TaskTodoIcon, TaskDoingIcon, TaskDoneIcon } from './icons/TaskStatusIcons';

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

const resolveStatus = (
  value: TodoItem['status'],
  done: boolean,
): 'todo' | 'doing' | 'done' => {
  if (value === 'todo' || value === 'doing' || value === 'done') {
    return value;
  }

  return done ? 'done' : 'todo';
};

const STATUS_DISPLAY: Record<
  'todo' | 'doing' | 'done',
  {
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    label: string;
    srLabel: string;
    iconClass: string;
    chipClass: string;
  }
> = {
  todo: {
    Icon: TaskTodoIcon,
    label: 'À faire',
    srLabel: 'Tâche à faire',
    iconClass: 'text-slate-400 dark:text-slate-300',
    chipClass: 'bg-slate-500/10 text-slate-300 border border-slate-500/30 dark:bg-slate-500/20 dark:text-slate-200 dark:border-slate-500/40',
  },
  doing: {
    Icon: TaskDoingIcon,
    label: 'En cours',
    srLabel: 'Tâche en cours',
    iconClass: 'text-amber-300',
    chipClass: 'bg-amber-500/10 text-amber-300 border border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40',
  },
  done: {
    Icon: TaskDoneIcon,
    label: 'Terminé',
    srLabel: 'Tâche terminée',
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

  const { todos, loading, error, readOnly: isReadOnly, addItem, updateItem, deleteItem, toggleItem } = useDailyTodos({
    userId,
    date: dateStr,
    teamId,
    enabled: Boolean(userId && dateStr),
  });

  const { showTaskStatusBadges, showTaskPriorityBadges } = useSettings() || {};
  const showStatusBadges = showTaskStatusBadges !== false;
  const showPriorityBadges = showTaskPriorityBadges !== false;

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

  const handleToggle = async (itemId: string) => {
    if (effectiveReadOnly) {
      return;
    }

    try {
      await toggleItem(itemId);
    } catch (err) {
      console.error('Failed to toggle item', err);
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
    async (itemId: string, currentStatus: 'todo' | 'doing' | 'done') => {
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
      <div
        data-testid="daily-todo-loading"
        className={`rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-yellow-50/50 p-4 shadow-sm dark:border-amber-900/30 dark:from-amber-950/40 dark:to-yellow-950/20 ${
          compact ? 'p-3' : 'p-6'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-amber-700 dark:text-amber-300">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="daily-todo-error"
        className={`rounded-xl border border-red-200/70 bg-gradient-to-br from-red-50 to-rose-50/50 p-4 shadow-sm dark:border-red-900/30 dark:from-red-950/40 dark:to-rose-950/20 ${
          compact ? 'p-3' : 'p-6'
        }`}
      >
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div
      data-testid="daily-todo-panel"
      className={`rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-yellow-50/50 shadow-sm transition-colors dark:border-amber-900/30 dark:from-amber-950/40 dark:to-yellow-950/20 ${
        compact ? 'p-3' : 'p-6'
      }`}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-amber-500/10 p-2 dark:bg-amber-500/20">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
          À ne pas oublier
        </h3>
        {effectiveReadOnly && (
          <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            Lecture seule
          </span>
        )}
      </div>

      {/* Add new item form */}
      {!effectiveReadOnly && (
        <form onSubmit={handleAdd} className="mb-4 space-y-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Nouvelle note..."
            data-testid="todo-input-text"
            className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
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
                className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800 dark:bg-slate-800 dark:text-slate-100"
                aria-label="Priorité"
              >
                <option value="high">Importante 🔥</option>
                <option value="medium">Moyenne 🙂</option>
                <option value="low">Faible 💤</option>
              </select>
            </div>
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              data-testid="todo-input-time"
              className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800 dark:bg-slate-800 dark:text-slate-100"
              aria-label="Heure limite (optionnel)"
            />
            <button
              type="submit"
              disabled={!newText.trim()}
              data-testid="todo-add-button"
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300 dark:bg-amber-600 dark:hover:bg-amber-500 dark:disabled:bg-amber-900"
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
          <p className="py-4 text-center text-sm text-amber-600 dark:text-amber-400">
            Rien à noter pour le moment 👍
          </p>
        ) : (
          sortedItems.map((item) => {
            const statusKey = resolveStatus(item.status, item.done);
            const statusDisplay = STATUS_DISPLAY[statusKey];
            const StatusIcon = statusDisplay.Icon;
            const resolvedPriority = resolvePriority(item.priority);

            return (
              <div
                key={item.id}
                data-testid={`todo-item-${item.id}`}
                className={`flex items-start gap-3 rounded-lg border bg-white/70 p-3 shadow-sm transition-colors dark:bg-amber-950/20 ${
                  item.done
                    ? 'border-amber-200/30 opacity-60 dark:border-amber-800/20'
                    : 'border-amber-200/50 dark:border-amber-800/30'
                }`}
              >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => handleToggle(item.id)}
                disabled={effectiveReadOnly}
                data-testid={`todo-checkbox-${item.id}`}
                className="mt-1 h-5 w-5 cursor-pointer rounded border-amber-300 text-amber-600 transition-colors focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed dark:border-amber-700 dark:bg-slate-800"
                aria-label={`Marquer "${item.text}" comme ${item.done ? 'non fait' : 'fait'}`}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      data-testid={`todo-edit-text-${item.id}`}
                      className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        data-testid={`todo-edit-time-${item.id}`}
                        className="rounded border border-amber-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(item.id)}
                        className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded bg-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-400 dark:bg-slate-700 dark:text-slate-300"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {showStatusBadges && (
                      <button
                        type="button"
                        onClick={() => toggleTaskDone(item.id, statusKey)}
                        disabled={effectiveReadOnly}
                        className="inline-flex items-center gap-1 rounded-md bg-transparent p-0 text-xs font-medium text-slate-500 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={
                          statusKey === 'done'
                            ? 'Marquer la tâche comme à faire'
                            : 'Marquer la tâche comme terminée'
                        }
                        aria-pressed={statusKey === 'done'}
                        data-testid={`todo-status-toggle-${item.id}`}
                      >
                        <StatusIcon
                          className={`h-4 w-4 ${statusDisplay.iconClass}`}
                          aria-hidden="true"
                        />
                        <span
                          className={`ml-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none ${statusDisplay.chipClass}`}
                          aria-hidden="true"
                        >
                          {statusDisplay.label}
                        </span>
                        <span className="sr-only">{statusDisplay.srLabel}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => !effectiveReadOnly && startEdit(item)}
                      disabled={effectiveReadOnly}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {item.time && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                            {item.time}
                          </span>
                        )}
                        <span
                          className={`min-w-0 text-sm ${
                            item.done
                              ? 'flex-1 text-slate-500 line-through dark:text-slate-400'
                              : 'flex-1 text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {item.text}
                        </span>
                      </div>
                      <PriorityNumberBadge
                        priority={resolvedPriority}
                        show={showPriorityBadges}
                      />
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
                  className="mt-1 rounded p-1 text-red-500 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-400 dark:hover:bg-red-950/30"
                  aria-label={`Supprimer "${item.text}"`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
