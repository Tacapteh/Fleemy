const TEAMS_CACHE_KEY = 'fleemy_profile_picker_teams_cache';
const TEAMS_CACHE_TTL_MS = 60_000; // 1 minute cache to speed up perceived loading

const isBrowser = typeof window !== 'undefined';

export const readTeamsCache = () => {
  if (!isBrowser) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(TEAMS_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.cachedAt === 'number' &&
      Array.isArray(parsed?.teams) &&
      Date.now() - parsed.cachedAt < TEAMS_CACHE_TTL_MS
    ) {
      return parsed.teams;
    }
  } catch (cacheError) {
    console.warn('Unable to read cached teams:', cacheError);
  }

  return null;
};

export const writeTeamsCache = (teams) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      TEAMS_CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), teams }),
    );
  } catch (cacheError) {
    console.warn('Unable to cache teams:', cacheError);
  }
};

export const clearTeamsCache = () => {
  if (!isBrowser) {
    return;
  }

  try {
    window.sessionStorage.removeItem(TEAMS_CACHE_KEY);
  } catch (cacheError) {
    console.warn('Unable to clear cached teams:', cacheError);
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
  }

  return null;
};

export const hasFreshTeamsCache = () => readTeamsCache() !== null;

let pendingTeamsPromise = null;

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
  const data = await fetcher();
  return cacheTeamsFromResponse(data);
};

export const ensureTeamsCache = async (fetcher, { forceRefresh = false } = {}) => {
  const cachedTeams = readTeamsCache();

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
