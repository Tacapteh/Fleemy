// Budget API service
import { getAuthHeaders } from '../utils/authHeaders';

const RAW_API_URL = process.env.REACT_APP_BACKEND_URL;
const API_URL = RAW_API_URL ? RAW_API_URL.replace(/\/$/, '') : '';

if (!RAW_API_URL) {
  console.warn('REACT_APP_BACKEND_URL is not defined. Falling back to relative API paths.');
}

const NETWORK_ERROR_MESSAGE = 'Impossible de contacter le service Budget. Vérifiez la configuration du backend ou votre connexion réseau.';

const buildUrl = (path) => {
  if (!path.startsWith('/')) {
    return `${API_URL}/${path}`;
  }
  return `${API_URL}${path}`;
};

const parseJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null;
    }
    throw error;
  }
};

const ensureSuccess = async (response, defaultMessage) => {
  if (!response.ok) {
    let errorMessage = defaultMessage;
    try {
      const errorBody = await parseJsonSafely(response);
      errorMessage = errorBody?.error || errorBody?.detail || errorBody?.message || errorMessage;
    } catch (parseError) {
      errorMessage = response.statusText || defaultMessage;
    }
    throw new Error(errorMessage);
  }

  return parseJsonSafely(response);
};

const performRequest = async (path, { method = 'GET', headers = {}, body, defaultMessage }) => {
  const url = buildUrl(path);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });
    return await ensureSuccess(response, defaultMessage);
  } catch (error) {
    if (error.name === 'TypeError' || error.message === 'Failed to fetch') {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    throw error;
  }
};

/**
 * Fetch budget items with recurrence expansion
 */
export const getBudgetItems = async (fromDate, toDate, teamMemberId = null) => {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    from: fromDate,
    to: toDate
  });
  
  if (teamMemberId) {
    params.append('teamMemberId', teamMemberId);
  }
  
  return performRequest(`/api/budget/items?${params}`, {
    headers,
    defaultMessage: 'Failed to fetch budget items'
  });
};

/**
 * Create a new budget item
 */
export const createBudgetItem = async (item) => {
  const headers = await getAuthHeaders();
  
  return performRequest('/api/budget/items', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(item),
    defaultMessage: 'Failed to create budget item'
  });
};

/**
 * Update a budget item
 */
export const updateBudgetItem = async (itemId, updates, teamMemberId = null) => {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  
  if (teamMemberId) {
    params.append('teamMemberId', teamMemberId);
  }
  
  const path = `/api/budget/items/${itemId}${params.toString() ? '?' + params : ''}`;

  return performRequest(path, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates),
    defaultMessage: 'Failed to update budget item'
  });
};

/**
 * Delete a budget item
 */
export const deleteBudgetItem = async (itemId, teamMemberId = null) => {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  
  if (teamMemberId) {
    params.append('teamMemberId', teamMemberId);
  }
  
  const path = `/api/budget/items/${itemId}${params.toString() ? '?' + params : ''}`;

  return performRequest(path, {
    method: 'DELETE',
    headers,
    defaultMessage: 'Failed to delete budget item'
  });
};

/**
 * Get budget settings
 */
export const getBudgetSettings = async () => {
  const headers = await getAuthHeaders();
  
  return performRequest('/api/budget/settings', {
    headers,
    defaultMessage: 'Failed to fetch budget settings'
  });
};

/**
 * Update budget settings
 */
export const updateBudgetSettings = async (settings) => {
  const headers = await getAuthHeaders();
  
  return performRequest('/api/budget/settings', {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings),
    defaultMessage: 'Failed to update budget settings'
  });
};

/**
 * Get budget summary with aggregates
 */
export const getBudgetSummary = async (period, atDate, teamMemberId = null) => {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    period,
    at: atDate
  });
  
  if (teamMemberId) {
    params.append('teamMemberId', teamMemberId);
  }
  
  return performRequest(`/api/budget/summary?${params}`, {
    headers,
    defaultMessage: 'Failed to fetch budget summary'
  });
};

/**
 * Seed budget data (temporary for testing)
 */
export const seedBudgetData = async () => {
  const headers = await getAuthHeaders();
  
  return performRequest('/api/budget/seed', {
    method: 'POST',
    headers,
    defaultMessage: 'Failed to seed budget data'
  });
};
