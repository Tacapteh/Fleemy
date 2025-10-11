import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useFirebaseUser } from '../firebase';

/**
 * Hook pour gérer les clients avec pagination et recherche
 */
export default function useClients(userOrOptions, maybeOptions = {}) {
  const firebaseUser = useFirebaseUser();

  const hasExplicitUser =
    userOrOptions && typeof userOrOptions === 'object' && 'uid' in userOrOptions;

  const options =
    hasExplicitUser
      ? (maybeOptions || {})
      : (userOrOptions && typeof userOrOptions === 'object'
          ? userOrOptions
          : maybeOptions) || {};
  const user = hasExplicitUser ? userOrOptions : firebaseUser;
  const userId = user?.uid;

  const {
    page = 1,
    limit = 20,
    search = '',
    include_archived = false,
    autoLoad = true
  } = options;

  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const loadClients = useCallback(async (searchTerm = search, currentPage = page) => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        include_archived: include_archived.toString()
      });
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      
      const result = await apiFetch(`/clients?${params.toString()}`, {
        headers: { 'X-User-Id': userId }
      });
      
      setClients(result.clients || []);
      setTotal(result.total || 0);
      setHasMore(result.has_more || false);
    } catch (e) {
      console.error('useClients error:', e);
      setError(e.message || 'Erreur de chargement des clients');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [userId, page, limit, search, include_archived]);

  useEffect(() => {
    if (autoLoad) {
      loadClients();
    }
  }, [autoLoad, loadClients]);

  const createClient = async (data) => {
    if (!userId) throw new Error('User not authenticated');

    const result = await apiFetch('/clients', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: JSON.stringify(data)
    });
    
    await loadClients();
    return result;
  };

  const updateClient = async (clientId, data) => {
    if (!userId) throw new Error('User not authenticated');

    const result = await apiFetch(`/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'X-User-Id': userId },
      body: JSON.stringify(data)
    });
    
    await loadClients();
    return result;
  };

  const deleteClient = async (clientId) => {
    if (!userId) throw new Error('User not authenticated');

    await apiFetch(`/clients/${clientId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId }
    });
    
    await loadClients();
  };

  return {
    clients,
    total,
    loading,
    error,
    hasMore,
    loadClients,
    createClient,
    updateClient,
    deleteClient,
    refresh: loadClients
  };
}
