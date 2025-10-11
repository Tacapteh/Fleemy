import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

/**
 * Hook pour gérer les clients avec pagination et recherche
 */
export default function useClients(user, options = {}) {
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
    if (!user?.uid) return;
    
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
        headers: { 'X-User-Id': user.uid }
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
  }, [user?.uid, page, limit, search, include_archived]);

  useEffect(() => {
    if (autoLoad) {
      loadClients();
    }
  }, [autoLoad, loadClients]);

  const createClient = async (data) => {
    if (!user?.uid) throw new Error('User not authenticated');
    
    const result = await apiFetch('/clients', {
      method: 'POST',
      headers: { 'X-User-Id': user.uid },
      body: JSON.stringify(data)
    });
    
    await loadClients();
    return result;
  };

  const updateClient = async (clientId, data) => {
    if (!user?.uid) throw new Error('User not authenticated');
    
    const result = await apiFetch(`/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'X-User-Id': user.uid },
      body: JSON.stringify(data)
    });
    
    await loadClients();
    return result;
  };

  const deleteClient = async (clientId) => {
    if (!user?.uid) throw new Error('User not authenticated');
    
    await apiFetch(`/clients/${clientId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': user.uid }
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
