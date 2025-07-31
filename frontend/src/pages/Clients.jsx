import React, { useEffect, useState } from 'react';
import api from '../api';
import ClientCard from '../components/clients/ClientCard';
import ClientForm from '../components/clients/ClientForm';
import { useOutletContext } from 'react-router-dom';

export default function Clients() {
  const { user } = useOutletContext();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await api.get('/clients', { headers: { 'X-User-Id': user.uid } });
      setClients(res.data || []);
    } catch (e) {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadClients();
    }
  }, [user]);

  const handleAdd = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (client) => {
    setEditing(client);
    setShowForm(true);
  };

  const handleDelete = async (client) => {
    if (!window.confirm('Supprimer ce client ?')) return;
    try {
      await api.delete(`/clients/${client.id}`, { headers: { 'X-User-Id': user.uid } });
      loadClients();
    } catch (e) {
      setError('Erreur lors de la suppression');
    }
  };

  const handleSubmit = async (data, applyRate) => {
    try {
      if (editing) {
        await api.put(`/clients/${editing.id}?apply_rate=${applyRate ? 1 : 0}`, data, {
          headers: { 'X-User-Id': user.uid },
        });
      } else {
        await api.post('/clients', data, { headers: { 'X-User-Id': user.uid } });
      }
      setShowForm(false);
      loadClients();
    } catch (e) {
      setError('Erreur lors de l\'enregistrement');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Clients</h1>
        <button onClick={handleAdd} className="px-3 py-1 bg-blue-500 text-white rounded">
          Nouveau client
        </button>
      </div>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      {loading ? (
        <div>Chargement...</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <ClientCard key={c.id} client={c} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 rounded shadow w-full max-w-md">
            <ClientForm
              initialData={editing || {}}
              onSubmit={handleSubmit}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
