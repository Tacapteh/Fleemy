const STORAGE_KEY = 'fleemy:team-planning-api-support';
const NEGATIVE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const POSITIVE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

let cachedRecord;

const now = () => Date.now();

const readRecordFromStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const { supported, expiresAt } = parsed;
    if (typeof supported !== 'boolean') {
      return null;
    }
    if (typeof expiresAt === 'number' && expiresAt > 0 && expiresAt < now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      supported,
      expiresAt: typeof expiresAt === 'number' ? expiresAt : null,
    };
  } catch (error) {
    console.warn('Unable to read team planning API support cache', error);
    return null;
  }
};

const writeRecordToStorage = (record) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!record) {
      window.localStorage?.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        supported: record.supported,
        expiresAt: record.expiresAt ?? null,
      }),
    );
  } catch (error) {
    console.warn('Unable to persist team planning API support cache', error);
  }
};

const resolveCachedRecord = () => {
  if (cachedRecord !== undefined) {
    return cachedRecord;
  }

  cachedRecord = readRecordFromStorage();
  return cachedRecord;
};

const updateCache = (record) => {
  cachedRecord = record;
  writeRecordToStorage(record);
};

export const shouldUseTeamPlanningApi = () => {
  const record = resolveCachedRecord();
  if (!record) {
    return true;
  }

  if (record.expiresAt && record.expiresAt <= now()) {
    updateCache(null);
    return true;
  }

  return record.supported !== false;
};

export const markTeamPlanningApiSupported = () => {
  const record = {
    supported: true,
    expiresAt: now() + POSITIVE_TTL,
  };
  updateCache(record);
};

export const markTeamPlanningApiUnsupported = () => {
  const record = {
    supported: false,
    expiresAt: now() + NEGATIVE_TTL,
  };
  updateCache(record);
};

export const clearTeamPlanningApiCache = () => {
  updateCache(null);
};

