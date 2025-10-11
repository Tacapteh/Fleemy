import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import ClientCard from '../components/clients/ClientCard';
import ClientForm from '../components/clients/ClientForm';
import useClients from '../hooks/useClients';
import { showToast } from '../utils/toast';

export default function Clients() {
  const { user } = useOutletContext();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const {
    clients,
    total,
    loading,
    error,
    hasMore,
    createClient,
    updateClient,
    deleteClient,
    loadClients
  } = useClients(user, { page, limit: 20, search: debouncedSearch });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reload when page changes
  useEffect(() => {
    loadClients(debouncedSearch, page);
  }, [page, debouncedSearch, loadClients]);

  const handleAdd = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (client) => {
    setEditing(client);
    setShowForm(true);
  };

  const handleDelete = async (client) => {
    if (!window.confirm(`Supprimer le client "${client.display_name}" ?`)) return;
    try {
      await deleteClient(client.id);
      showToast('Client supprimé avec succès');
    } catch (e) {
      console.error('Delete error:', e);
      showToast('Erreur lors de la suppression', true);
    }
  };

  const handleSubmit = async (data) => {
    try {
      if (editing) {
        await updateClient(editing.id, data);
        showToast('Client modifié avec succès');
      } else {
        await createClient(data);
        showToast('Client créé avec succès');
      }
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      console.error('Submit error:', e);
      showToast(e.message || 'Erreur lors de l\'enregistrement', true);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (hasMore) setPage(page + 1);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-900" data-testid="clients-page-title">
          Clients
        </h1>
        <button 
          onClick={handleAdd} 
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
          data-testid="add-client-button"
          aria-label="Ajouter un nouveau client"
        >
          + Nouveau client
        </button>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <label htmlFor="search-clients" className="sr-only">
          Rechercher un client
        </label>
        <input
          id="search-clients"
          type="text"
          placeholder="Rechercher un client par nom..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="search-clients-input"
          aria-label="Rechercher un client"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      {/* Results count */}
      {!loading && (
        <div className="mb-4 text-sm text-gray-600" aria-live="polite" aria-atomic="true">
          {total} client{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-600">Chargement...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">
            {search ? 'Aucun client trouvé pour cette recherche' : 'Aucun client enregistré'}
          </p>
          {!search && (
            <button
              onClick={handleAdd}
              className="mt-4 text-blue-500 hover:text-blue-600 font-medium"
            >
              Créer votre premier client
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Client cards grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between py-4 border-t border-gray-200">
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="prev-page-button"
              aria-label="Page précédente"
            >
              ← Précédent
            </button>
            <span className="text-sm text-gray-600">
              Page {page}
            </span>
            <button
              onClick={handleNextPage}
              disabled={!hasMore}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="next-page-button"
              aria-label="Page suivante"
            >
              Suivant →
            </button>
          </div>
        </>
      )}

      {/* Modal Form */}
      {showForm && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-form-title"
        >
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <ClientForm
              initialData={editing || {}}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
