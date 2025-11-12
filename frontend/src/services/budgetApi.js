// Budget API service
import { getAuthHeaders } from '../utils/authHeaders';

const API_URL = process.env.REACT_APP_BACKEND_URL;

if (!API_URL) {
  console.error('REACT_APP_BACKEND_URL is not defined');
}

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
  
  const response = await fetch(`${API_URL}/api/budget/items?${params}`, {
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to fetch budget items');
  }
  
  return response.json();
};

/**
 * Create a new budget item
 */
export const createBudgetItem = async (item) => {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/budget/items`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(item)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to create budget item');
  }
  
  return response.json();
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
  
  const url = `${API_URL}/api/budget/items/${itemId}${params.toString() ? '?' + params : ''}`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to update budget item');
  }
  
  return response.json();
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
  
  const url = `${API_URL}/api/budget/items/${itemId}${params.toString() ? '?' + params : ''}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to delete budget item');
  }
  
  return response.json();
};

/**
 * Get budget settings
 */
export const getBudgetSettings = async () => {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/budget/settings`, {
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to fetch budget settings');
  }
  
  return response.json();
};

/**
 * Update budget settings
 */
export const updateBudgetSettings = async (settings) => {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/budget/settings`, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to update budget settings');
  }
  
  return response.json();
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
  
  const response = await fetch(`${API_URL}/api/budget/summary?${params}`, {
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to fetch budget summary');
  }
  
  return response.json();
};

/**
 * Seed budget data (temporary for testing)
 */
export const seedBudgetData = async () => {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_URL}/api/budget/seed`, {
    method: 'POST',
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.detail || 'Failed to seed budget data');
  }
  
  return response.json();
};
