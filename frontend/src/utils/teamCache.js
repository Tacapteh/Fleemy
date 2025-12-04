import { fetchUserTeamsFromFirestore } from '../firebase';

const TEAMS_CACHE_KEY = 'fleemy_profile_picker_teams_cache';
// Keep the cache for a full day to avoid losing the last known teams when the sessionStorage is cleared
// (e.g. after keeping the tab idle for a while or reopening the app).
const TEAMS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const isBrowser = typeof window !== 'undefined';
const storage = () => {
  if (!isBrowser) {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Unable to access localStorage, falling back to sessionStorage', error);
    try {
      return window.sessionStorage;
    } catch (sessionError) {
      console.warn('Unable to access sessionStorage either', sessionError);
      return null;
    }
  }
};

export const readTeamsCache = (options = {}) => {
  const allowExpired = options.allowExpired === true;

  if (!isBrowser) {
    return null;
  }

  const store = storage();
  if (!store) {
    return null;
  }

  try {
    const raw = store.getItem(TEAMS_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const isFresh =
      typeof parsed?.cachedAt === 'number' &&
      Date.now() - parsed.cachedAt < TEAMS_CACHE_TTL_MS;

    if (Array.isArray(parsed?.teams) && (allowExpired || isFresh)) {
      return parsed.teams;
    }
  } catch (cacheError) {
    console.warn('Unable to read cached teams:', cacheError);
  }

  return null;
};

export const readStaleTeamsCache = () => readTeamsCache({ allowExpired: true });

export const writeTeamsCache = (teams) => {
  if (!isBrowser) {
    return;
  }

  const store = storage();
  if (!store) {
    return;
  }

  try {
    store.setItem(TEAMS_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), teams }));
  } catch (cacheError) {
    console.warn('Unable to cache teams:', cacheError);
  }
};

export const clearTeamsCache = () => {
  if (!isBrowser) {
    return;
  }

  try {
    const store = storage();
    store?.removeItem(TEAMS_CACHE_KEY);
  } catch (cacheError) {
    console.warn('Unable to clear cached teams:', cacheError);
  }
};

export const removeTeamFromCache = (teamId) => {
  if (!teamId || !isBrowser) {
    return;
  }

  try {
    const cached = readStaleTeamsCache();
    if (!Array.isArray(cached)) {
      return;
    }

    const filtered = cached.filter((team) => team?.team_id !== teamId);
    writeTeamsCache(filtered);
  } catch (cacheError) {
    console.warn('Unable to remove team from cache:', cacheError);
  }
};

export const normalizeTeamsResponse = (data) => {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    if (Array.isArray(data.teams)) {
      return data.teams;
    }

    if (Array.isArray(data.data)) {
      return data.data;
    }

    if (data.success === true && data.teams === undefined) {
      return [];
    }
  }

  return null;
};

export const hasFreshTeamsCache = () => readTeamsCache() !== null;

let pendingTeamsPromise = null;

const allowExpiredCacheRead = () => readTeamsCache({ allowExpired: true });

const buildResult = (teams, raw, success, fromCache) => ({
  teams,
  raw,
  success,
  fromCache,
});

const cacheTeamsFromResponse = (data) => {
  const resolvedTeams = normalizeTeamsResponse(data);

  if (Array.isArray(resolvedTeams)) {
    writeTeamsCache(resolvedTeams);
    return buildResult(resolvedTeams, data, true, false);
  }

  if (data && typeof data === 'object' && data.success) {
    const teamsList = Array.isArray(data.teams) ? data.teams : [];
    writeTeamsCache(teamsList);
    return buildResult(teamsList, data, true, false);
  }

  clearTeamsCache();
  return buildResult([], data, false, false);
};

const fetchAndCacheTeams = async (fetcher) => {
  let primaryError = null;
  let primaryResult = null;

  if (typeof fetcher === 'function') {
    try {
      const data = await fetcher();
      const result = cacheTeamsFromResponse(data);
      primaryResult = { ...result, viaApi: true };
      if (result.success) {
        return primaryResult;
      }
    } catch (error) {
      primaryError = error;
    }
  }

  try {
    const fallbackTeams = await fetchUserTeamsFromFirestore();
    const fallbackPayload = {
      success: true,
      source: 'firestore',
      teams: fallbackTeams,
    };
    const result = cacheTeamsFromResponse(fallbackPayload);
    return { ...result, viaFirestore: true };
  } catch (firestoreError) {
    clearTeamsCache();

    if (primaryResult) {
      return primaryResult;
    }

    if (primaryError) {
      primaryError.fallbackError = firestoreError;
      throw primaryError;
    }

    throw firestoreError;
  }
};

export const ensureTeamsCache = async (fetcher, { forceRefresh = false } = {}) => {
  const cachedTeams = readTeamsCache();
  const staleTeams = allowExpiredCacheRead();

  if (!forceRefresh && cachedTeams !== null) {
    return buildResult(cachedTeams, null, true, true);
  }

  if (pendingTeamsPromise) {
    return pendingTeamsPromise;
  }

  const runner = (async () => {
    try {
      const result = await fetchAndCacheTeams(fetcher);
      return result;
    } catch (error) {
      if (staleTeams !== null) {
        return buildResult(staleTeams, null, true, true);
      }

      clearTeamsCache();
      throw error;
    } finally {
      pendingTeamsPromise = null;
    }
  })();

  pendingTeamsPromise = runner;
  return runner;
};

export { TEAMS_CACHE_KEY, TEAMS_CACHE_TTL_MS };
