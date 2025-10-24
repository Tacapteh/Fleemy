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
    <div className="mx-auto max-w-7xl text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100" data-testid="clients-page-title">
          Clients
        </h1>
        <button
          onClick={handleAdd}
          className="rounded-lg bg-blue-500 px-4 py-2 text-white shadow-sm transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
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
          className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          data-testid="search-clients-input"
          aria-label="Rechercher un client"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-100 p-4 text-red-700 dark:bg-red-500/20 dark:text-red-200" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      {/* Results count */}
      {!loading && (
        <div className="mb-4 text-sm text-gray-600 dark:text-slate-300" aria-live="polite" aria-atomic="true">
          {total} client{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-600 dark:text-slate-300">Chargement...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-lg bg-gray-50 py-12 text-center dark:bg-slate-800">
          <p className="text-gray-600 dark:text-slate-300">
            {search ? 'Aucun client trouvé pour cette recherche' : 'Aucun client enregistré'}
          </p>
          {!search && (
            <button
              onClick={handleAdd}
              className="mt-4 font-medium text-blue-500 transition-colors hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-200"
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
          <div className="flex items-center justify-between border-t border-gray-200 py-4 dark:border-slate-800">
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className="rounded-lg bg-gray-200 px-4 py-2 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
              data-testid="prev-page-button"
              aria-label="Page précédente"
            >
              ← Précédent
            </button>
            <span className="text-sm text-gray-600 dark:text-slate-300">
              Page {page}
            </span>
            <button
              onClick={handleNextPage}
              disabled={!hasMore}
              className="rounded-lg bg-gray-200 px-4 py-2 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
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
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl transition-colors dark:bg-slate-900 dark:text-slate-100">
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
