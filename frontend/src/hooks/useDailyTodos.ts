import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { DailyTodoDoc, TodoItem } from '../types/todo';

interface UseDailyTodosOptions {
  userId: string;
  date: string; // "YYYY-MM-DD"
  teamId?: string | null;
  enabled?: boolean;
}

export default function useDailyTodos({
  userId,
  date,
  teamId = null,
  enabled = true,
}: UseDailyTodosOptions) {
  const [todos, setTodos] = useState<DailyTodoDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const fetchTodos = useCallback(async () => {
    if (!enabled || !userId || !date) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (teamId) {
        params.set('team_id', teamId);
      }
      
      const query = params.toString();
      const response = await apiFetch(
        `/daily-todos/${userId}/${date}${query ? `?${query}` : ''}`,
        {
          headers: { 'X-User-Id': userId },
        }
      );

      if (response && response.success) {
        setTodos(response.data);
        setReadOnly(response.readOnly || false);
      } else {
        throw new Error(response?.error || 'Failed to fetch daily todos');
      }
    } catch (err: any) {
      console.error('useDailyTodos fetch error:', err);
      setError(err.message || 'Failed to load todos');
      setTodos(null);
    } finally {
      setLoading(false);
    }
  }, [userId, date, teamId, enabled]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addItem = useCallback(
    async (text: string, time?: string | null) => {
      if (!userId || !date || readOnly) {
        return;
      }

      try {
        const response = await apiFetch(`/daily-todos/${userId}/${date}/items`, {
          method: 'POST',
          body: JSON.stringify({ text, time: time || null }),
        });

        if (response && response.success) {
          setTodos(response.data);
        } else {
          throw new Error(response?.error || 'Failed to add item');
        }
      } catch (err: any) {
        console.error('useDailyTodos addItem error:', err);
        throw err;
      }
    },
    [userId, date, readOnly]
  );

  const updateItem = useCallback(
    async (itemId: string, updates: Partial<TodoItem>) => {
      if (!userId || !date || readOnly) {
        return;
      }

      try {
        const response = await apiFetch(
          `/daily-todos/${userId}/${date}/items/${itemId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(updates),
          }
        );

        if (response && response.success) {
          setTodos(response.data);
        } else {
          throw new Error(response?.error || 'Failed to update item');
        }
      } catch (err: any) {
        console.error('useDailyTodos updateItem error:', err);
        throw err;
      }
    },
    [userId, date, readOnly]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!userId || !date || readOnly) {
        return;
      }

      try {
        const response = await apiFetch(
          `/daily-todos/${userId}/${date}/items/${itemId}`,
          {
            method: 'DELETE',
          }
        );

        if (response && response.success) {
          setTodos(response.data);
        } else {
          throw new Error(response?.error || 'Failed to delete item');
        }
      } catch (err: any) {
        console.error('useDailyTodos deleteItem error:', err);
        throw err;
      }
    },
    [userId, date, readOnly]
  );

  const toggleItem = useCallback(
    async (itemId: string) => {
      if (!todos || readOnly) {
        return;
      }

      const item = todos.items.find((i) => i.id === itemId);
      if (!item) {
        return;
      }

      await updateItem(itemId, { done: !item.done });
    },
    [todos, updateItem, readOnly]
  );

  return {
    todos,
    loading,
    error,
    readOnly,
    addItem,
    updateItem,
    deleteItem,
    toggleItem,
    refresh: fetchTodos,
  };
}
