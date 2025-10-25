import React, { useState, useMemo } from 'react';
import { Trash2, Plus, Clock } from 'lucide-react';
import useDailyTodos from '../hooks/useDailyTodos';
import type { TodoItem } from '../types/todo';

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

  const [newText, setNewText] = useState('');
  const [newTime, setNewTime] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTime, setEditTime] = useState('');

  const effectiveReadOnly = readOnly || isReadOnly;

  const sortedItems = useMemo(() => {
    if (!todos?.items) {
      return [];
    }

    const undone = todos.items.filter((item) => !item.done);
    const done = todos.items.filter((item) => item.done);

    const sortByTime = (a: TodoItem, b: TodoItem) => {
      const aTime = a.time || '';
      const bTime = b.time || '';
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return aTime.localeCompare(bTime);
    };

    return [...undone.sort(sortByTime), ...done.sort(sortByTime)];
  }, [todos?.items]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || effectiveReadOnly) {
      return;
    }

    try {
      await addItem(newText.trim(), newTime || null);
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
          <div className="flex gap-2">
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
          sortedItems.map((item) => (
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
                  <button
                    type="button"
                    onClick={() => !effectiveReadOnly && startEdit(item)}
                    disabled={effectiveReadOnly}
                    className="w-full text-left disabled:cursor-default"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.time && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                          {item.time}
                        </span>
                      )}
                      <span
                        className={`text-sm ${
                          item.done
                            ? 'text-slate-500 line-through dark:text-slate-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {item.text}
                      </span>
                    </div>
                  </button>
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
          ))
        )}
      </div>
    </div>
  );
}
