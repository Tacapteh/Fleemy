import { useCallback, useEffect, useMemo, useState } from 'react';
import { watchWeekEvents, fetchWeekEventsOnce } from '../firebase';
import { getCachedPlanningData, setCachedPlanningData } from '../utils/planningCache';

const EVENTS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const REFRESH_EVENT_NAME = 'planning:refresh-week-slots';

const startOfWeek = (date) => {
  const value = date instanceof Date ? new Date(date) : new Date();
  if (Number.isNaN(value.getTime())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return startOfWeek(fallback);
  }
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfWeek = (weekStart) => {
  const base = weekStart instanceof Date ? new Date(weekStart) : startOfWeek(new Date());
  if (Number.isNaN(base.getTime())) {
    return endOfWeek(startOfWeek(new Date()));
  }
  base.setDate(base.getDate() + 6);
  base.setHours(23, 59, 59, 999);
  return base;
};

const toIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateInput = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const candidate = new Date(trimmed);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      const candidate = value.toDate();
      return candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate : null;
    } catch (error) {
      return null;
    }
  }

  return null;
};

export const buildContextKey = (context) => {
  if (!context || typeof context !== 'object') {
    return 'none';
  }

  if (context.type === 'team') {
    const team = context.teamId || context.team_id || 'team';
    const member = context.memberUid || context.member_uid || context.userId || 'member';
    return `team:${team}:${member}`;
  }

  if (context.type === 'personal') {
    const userId = context.userId || context.uid || 'user';
    return `personal:${userId}`;
  }

  if (context.userId) {
    return `personal:${context.userId}`;
  }

  return 'none';
};

export const requestWeekSlotsRefresh = (context, weekStartInput, weekEndInput) => {
  if (typeof window === 'undefined') {
    return;
  }

  const contextKey = buildContextKey(context);
  if (!contextKey || contextKey === 'none') {
    return;
  }

  const startDate = normalizeDateInput(weekStartInput);
  const endDate = normalizeDateInput(weekEndInput);

  const detail = {
    contextKey,
    weekStartISO: toIsoDate(startDate),
    weekEndISO: toIsoDate(endDate || (startDate ? endOfWeek(startDate) : null)),
  };

  window.dispatchEvent(new CustomEvent(REFRESH_EVENT_NAME, { detail }));
};

export default function useUserWeekSlots(userId, options = {}) {
  const {
    weekStart: weekStartInput,
    weekEnd: weekEndInput,
    referenceDate,
    context: providedContext,
    teamId = null,
    memberUid = null,
    enabled = true,
  } = options;

  const resolvedWeekStart = useMemo(() => {
    const explicitStart = normalizeDateInput(weekStartInput);
    if (explicitStart) {
      explicitStart.setHours(0, 0, 0, 0);
      return explicitStart;
    }

    const reference = normalizeDateInput(referenceDate);
    if (reference) {
      return startOfWeek(reference);
    }

    return startOfWeek(new Date());
  }, [weekStartInput, referenceDate]);

  const resolvedWeekEnd = useMemo(() => {
    const explicitEnd = normalizeDateInput(weekEndInput);
    if (explicitEnd) {
      explicitEnd.setHours(23, 59, 59, 999);
      return explicitEnd;
    }
    return endOfWeek(resolvedWeekStart);
  }, [weekEndInput, resolvedWeekStart]);

  const resolvedContext = useMemo(() => {
    if (providedContext) {
      return providedContext;
    }

    if (teamId) {
      const member = memberUid || userId || null;
      if (!member) {
        return null;
      }
      return { type: 'team', teamId, memberUid: member };
    }

    if (userId) {
      return { type: 'personal', userId };
    }

    return null;
  }, [providedContext, teamId, memberUid, userId]);

  const weekStartISO = useMemo(() => toIsoDate(resolvedWeekStart), [resolvedWeekStart]);
  const weekEndISO = useMemo(() => toIsoDate(resolvedWeekEnd), [resolvedWeekEnd]);

  const contextKey = useMemo(() => buildContextKey(resolvedContext), [resolvedContext]);

  const eventsCacheKey = useMemo(() => {
    if (!resolvedContext || contextKey === 'none' || !weekStartISO || !weekEndISO) {
      return null;
    }
    return `events:${contextKey}:${weekStartISO}:${weekEndISO}`;
  }, [resolvedContext, contextKey, weekStartISO, weekEndISO]);

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const handleRefreshRequest = useCallback(
    (event) => {
      const detail = event?.detail || {};

      if (detail.contextKey && detail.contextKey !== contextKey) {
        return;
      }

      if (detail.weekStartISO && weekStartISO && detail.weekStartISO !== weekStartISO) {
        return;
      }

      if (detail.weekEndISO && weekEndISO && detail.weekEndISO !== weekEndISO) {
        return;
      }

      setRefreshToken((token) => token + 1);
    },
    [contextKey, weekStartISO, weekEndISO],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    window.addEventListener(REFRESH_EVENT_NAME, handleRefreshRequest);
    return () => {
      window.removeEventListener(REFRESH_EVENT_NAME, handleRefreshRequest);
    };
  }, [handleRefreshRequest]);

  useEffect(() => {
    if (!enabled) {
      setSlots([]);
      setLoading(true);
      setError(null);
      return () => {};
    }

    if (!resolvedContext || !weekStartISO || !weekEndISO) {
      setSlots([]);
      setLoading(false);
      setError(null);
      return () => {};
    }

    let unsubscribe = () => {};
    let cancelled = false;
    let hasRealtimeUpdate = false;

    const cachedEvents = eventsCacheKey ? getCachedPlanningData(eventsCacheKey) : null;
    if (Array.isArray(cachedEvents)) {
      setSlots(cachedEvents);
      setLoading(false);
    } else {
      setSlots([]);
      setLoading(true);
    }
    setError(null);

    let fallbackAttempted = false;

    const prefetchEvents = async () => {
      if (!eventsCacheKey) {
        return;
      }
      try {
        const fallbackEvents = await fetchWeekEventsOnce(
          resolvedContext,
          weekStartISO,
          weekEndISO,
        );
        if (cancelled || hasRealtimeUpdate || !Array.isArray(fallbackEvents)) {
          return;
        }
        setSlots(fallbackEvents);
        setLoading(false);
        fallbackAttempted = true;
        setCachedPlanningData(eventsCacheKey, fallbackEvents, EVENTS_CACHE_TTL);
      } catch (prefetchError) {
        if (!cancelled) {
          console.warn('prefetchWeekEvents error', prefetchError);
        }
      }
    };

    prefetchEvents();

    const attemptFallback = async () => {
      if (fallbackAttempted) {
        return;
      }
      fallbackAttempted = true;
      try {
        const fallbackEvents = await fetchWeekEventsOnce(
          resolvedContext,
          weekStartISO,
          weekEndISO,
        );
        if (cancelled) {
          return;
        }
        if (Array.isArray(fallbackEvents)) {
          setSlots(fallbackEvents);
          setLoading(false);
          setError(null);
          if (eventsCacheKey) {
            setCachedPlanningData(eventsCacheKey, fallbackEvents, EVENTS_CACHE_TTL);
          }
          return;
        }
      } catch (fallbackError) {
        if (!cancelled) {
          console.error('watchWeekEvents fallback error', fallbackError);
        }
      }
      if (cancelled) {
        return;
      }
      if (!Array.isArray(cachedEvents)) {
        setSlots([]);
      }
      setLoading(false);
      setError('Impossible de charger les événements');
    };

    unsubscribe = watchWeekEvents(
      resolvedContext,
      weekStartISO,
      weekEndISO,
      (loadedEvents) => {
        if (cancelled) {
          return;
        }
        hasRealtimeUpdate = true;
        fallbackAttempted = true;
        setSlots(loadedEvents);
        setLoading(false);
        if (eventsCacheKey) {
          setCachedPlanningData(eventsCacheKey, loadedEvents, EVENTS_CACHE_TTL);
        }
      },
      (watchError) => {
        if (cancelled) {
          return;
        }
        console.error('watchWeekEvents error', watchError);
        attemptFallback();
      },
    );

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [
    enabled,
    resolvedContext,
    weekStartISO,
    weekEndISO,
    eventsCacheKey,
    refreshToken,
  ]);

  return { slots, loading, error };
}
