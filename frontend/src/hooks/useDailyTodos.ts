import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../lib/api';
import type { DailyTodoDoc, TodoItem } from '../types/todo';

interface UseDailyTodosOptions {
  userId: string;
  date: string; // "YYYY-MM-DD"
  teamId?: string | null;
  enabled?: boolean;
}

interface CacheEntry {
  data: DailyTodoDoc | null;
  readOnly: boolean;
  timestamp: number;
}

const TODO_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const normalizeTodoPriority = (
  value: TodoItem['priority'],
): 'high' | 'medium' | 'low' => {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : 'medium';
};

const normalizeTodoDoc = (doc: DailyTodoDoc | null): DailyTodoDoc | null => {
  if (!doc) {
    return null;
  }

  const normalizedItems = Array.isArray(doc.items)
    ? doc.items.map((item) => ({
        ...item,
        priority: normalizeTodoPriority(item.priority),
      }))
    : [];

  return {
    ...doc,
    items: normalizedItems,
  };
};

const buildCacheKey = (userId: string, date: string, teamId?: string | null) => {
  const scope = teamId ?? 'solo';
  return `${userId}::${scope}::${date}`;
};

const getCacheEntry = (key: string): CacheEntry | null => {
  const entry = TODO_CACHE.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    TODO_CACHE.delete(key);
    return null;
  }

  return entry;
};

const setCacheEntry = (key: string, data: DailyTodoDoc | null, readOnly: boolean) => {
  TODO_CACHE.set(key, {
    data: normalizeTodoDoc(data),
    readOnly,
    timestamp: Date.now(),
  });
};

const clearCacheEntry = (key: string) => {
  TODO_CACHE.delete(key);
};

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

  const abortControllerRef = useRef<AbortController | null>(null);

  const cacheKey = useMemo(() => {
    if (!enabled || !userId || !date) {
      return null;
    }
    return buildCacheKey(userId, date, teamId);
  }, [enabled, userId, date, teamId]);

  const applyResponseState = useCallback(
    (nextTodos: DailyTodoDoc | null, nextReadOnly?: boolean) => {
      const resolvedReadOnly = typeof nextReadOnly === 'boolean' ? nextReadOnly : readOnly;

      const normalizedTodos = normalizeTodoDoc(nextTodos);
      setTodos(normalizedTodos);
      setReadOnly(resolvedReadOnly);
      setError(null);

      if (cacheKey) {
        setCacheEntry(cacheKey, normalizedTodos, resolvedReadOnly);
      }
    },
    [cacheKey, readOnly],
  );

  const fetchTodos = useCallback(
    async (options: { force?: boolean; ignoreCache?: boolean } = {}) => {
      const { force = false, ignoreCache = false } = options;

      if (!enabled || !userId || !date) {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setTodos(null);
        setReadOnly(false);
        setError(null);
        setLoading(false);
        if (cacheKey) {
          clearCacheEntry(cacheKey);
        }
        return;
      }

      const key = cacheKey ?? buildCacheKey(userId, date, teamId);
      const cachedEntry = !ignoreCache && key ? getCacheEntry(key) : null;

      if (cachedEntry) {
        setTodos(normalizeTodoDoc(cachedEntry.data));
        setReadOnly(cachedEntry.readOnly);
        setError(null);

        if (!force && Date.now() - cachedEntry.timestamp < CACHE_TTL) {
          setLoading(false);
          return;
        }

        setLoading(false);
      } else {
        setLoading(true);
        setError(null);
        setTodos(null);
        setReadOnly(false);
      }

      abortControllerRef.current?.abort();
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortControllerRef.current = controller;

      try {
        const params = new URLSearchParams();
        if (teamId) {
          params.set('team_id', teamId);
        }

        const query = params.toString();
        const response = await apiFetch(
          `/daily-todos/${userId}/${date}${query ? `?${query}` : ''}`,
          {
            headers: { 'X-User-Id': userId },
            signal: controller?.signal,
          }
        );

        if (controller?.signal?.aborted) {
          return;
        }

        if (response && response.success) {
          const nextTodos: DailyTodoDoc | null = response.data ?? null;
          const rawReadOnly = response?.readOnly;
          const nextReadOnly =
            typeof rawReadOnly === 'boolean' ? rawReadOnly : false;
          applyResponseState(nextTodos, nextReadOnly);
        } else {
          throw new Error(response?.error || 'Failed to fetch daily todos');
        }
      } catch (err: any) {
        if (controller?.signal?.aborted) {
          return;
        }
        console.error('useDailyTodos fetch error:', err);
        setError(err.message || 'Failed to load todos');
        if (!cachedEntry) {
          setTodos(null);
          setReadOnly(false);
        }
      } finally {
        if (!controller?.signal?.aborted) {
          setLoading(false);
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
        }
      }
    },
    [
      enabled,
      userId,
      date,
      teamId,
      cacheKey,
      applyResponseState,
    ],
  );

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const addItem = useCallback(
    async (
      text: string,
      time?: string | null,
      priority?: TodoItem['priority'],
    ) => {
      if (!userId || !date || readOnly) {
        return;
      }

      try {
        const resolvedPriority = normalizeTodoPriority(priority);
        const response = await apiFetch(`/daily-todos/${userId}/${date}/items`, {
          method: 'POST',
          body: JSON.stringify({ text, time: time || null, priority: resolvedPriority }),
        });

        if (response && response.success) {
          const rawReadOnly = response?.readOnly;
          applyResponseState(
            response.data ?? null,
            typeof rawReadOnly === 'boolean' ? rawReadOnly : undefined,
          );
        } else {
          throw new Error(response?.error || 'Failed to add item');
        }
      } catch (err: any) {
        console.error('useDailyTodos addItem error:', err);
        throw err;
      }
    },
    [userId, date, readOnly, applyResponseState]
  );

  const updateItem = useCallback(
    async (itemId: string, updates: Partial<TodoItem>) => {
      if (!userId || !date || readOnly) {
        return;
      }

      try {
        const payload: Partial<TodoItem> = { ...updates };
        if (Object.prototype.hasOwnProperty.call(payload, 'priority')) {
          if (payload.priority === undefined) {
            delete (payload as Record<string, unknown>).priority;
          } else {
            payload.priority = normalizeTodoPriority(payload.priority);
          }
        }
        const response = await apiFetch(
          `/daily-todos/${userId}/${date}/items/${itemId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }
        );

        if (response && response.success) {
          const rawReadOnly = response?.readOnly;
          applyResponseState(
            response.data ?? null,
            typeof rawReadOnly === 'boolean' ? rawReadOnly : undefined,
          );
        } else {
          throw new Error(response?.error || 'Failed to update item');
        }
      } catch (err: any) {
        console.error('useDailyTodos updateItem error:', err);
        throw err;
      }
    },
    [userId, date, readOnly, applyResponseState]
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
          const rawReadOnly = response?.readOnly;
          applyResponseState(
            response.data ?? null,
            typeof rawReadOnly === 'boolean' ? rawReadOnly : undefined,
          );
        } else {
          throw new Error(response?.error || 'Failed to delete item');
        }
      } catch (err: any) {
        console.error('useDailyTodos deleteItem error:', err);
        throw err;
      }
    },
    [userId, date, readOnly, applyResponseState]
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
    refresh: (options?: { force?: boolean; ignoreCache?: boolean }) =>
      fetchTodos({ force: true, ignoreCache: true, ...options }),
  };
}
