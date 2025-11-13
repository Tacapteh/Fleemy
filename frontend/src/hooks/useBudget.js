// Budget hook for managing budget data
import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import {
  getBudgetItems,
  getBudgetSummary,
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  getBudgetSettings,
  updateBudgetSettings
} from '../services/budgetApi';

/**
 * Hook to manage budget data
 * @param {string} periodStart - Start date (YYYY-MM-DD)
 * @param {string} periodEnd - End date (YYYY-MM-DD)
 * @param {string|null} teamMemberId - Optional team member ID for read-only access
 */
export const useBudget = (periodStart, periodEnd, teamMemberId = null) => {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentUser, setCurrentUser] = useState(() => auth.currentUser);

  useEffect(() => {
    if (!auth?.onAuthStateChanged) {
      return undefined;
    }

    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Fetch items and summary
  const fetchData = useCallback(async () => {
    if (!periodStart || !periodEnd) {
      return;
    }

    if (!currentUser) {
      setItems([]);
      setSummary(null);
      setSettings(null);
      setError('Veuillez vous connecter pour consulter votre budget.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Extract year-month from periodStart
      const atDate = periodStart.substring(0, 7); // YYYY-MM

      const [itemsRes, summaryRes, settingsRes] = await Promise.all([
        getBudgetItems(periodStart, periodEnd, teamMemberId),
        getBudgetSummary('month', atDate, teamMemberId),
        !teamMemberId ? getBudgetSettings() : Promise.resolve(null)
      ]);

      if (itemsRes.success) {
        setItems(itemsRes.items || []);
      }

      if (summaryRes.success) {
        setSummary(summaryRes.summary || null);
      }

      if (settingsRes && settingsRes.success) {
        setSettings(settingsRes.settings || null);
      }
    } catch (err) {
      console.error('Error fetching budget data:', err);
      setError(err.message || 'Failed to fetch budget data');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, teamMemberId, refreshTrigger, currentUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Invalidate cache and refresh
  const invalidate = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Create item
  const createItem = useCallback(async (itemData) => {
    try {
      const result = await createBudgetItem(itemData);
      if (result.success) {
        invalidate();
        return result.item;
      }
      throw new Error('Failed to create item');
    } catch (err) {
      console.error('Error creating budget item:', err);
      throw err;
    }
  }, [invalidate]);

  // Update item
  const updateItem = useCallback(async (itemId, updates) => {
    try {
      const result = await updateBudgetItem(itemId, updates, teamMemberId);
      if (result.success) {
        invalidate();
        return result.item;
      }
      throw new Error('Failed to update item');
    } catch (err) {
      console.error('Error updating budget item:', err);
      throw err;
    }
  }, [invalidate, teamMemberId]);

  // Delete item
  const deleteItem = useCallback(async (itemId) => {
    try {
      const result = await deleteBudgetItem(itemId, teamMemberId);
      if (result.success) {
        invalidate();
        return true;
      }
      throw new Error('Failed to delete item');
    } catch (err) {
      console.error('Error deleting budget item:', err);
      throw err;
    }
  }, [invalidate, teamMemberId]);

  // Update settings
  const updateSettings = useCallback(async (newSettings) => {
    try {
      const result = await updateBudgetSettings(newSettings);
      if (result.success) {
        setSettings(result.settings);
        return result.settings;
      }
      throw new Error('Failed to update settings');
    } catch (err) {
      console.error('Error updating budget settings:', err);
      throw err;
    }
  }, []);

  return {
    items,
    summary,
    settings,
    loading,
    error,
    createItem,
    updateItem,
    deleteItem,
    updateSettings,
    invalidate
  };
};
