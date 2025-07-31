import React from 'react';

export default function ClientCard({ client, onEdit, onDelete }) {
  return (
    <div className="bg-white border rounded shadow p-4 flex flex-col" style={{ borderColor: client.color || '#e5e7eb' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-3xl" style={{ color: client.color }}>{client.icon || '👤'}</span>
          <div>
            <div className="font-bold">
              {client.first_name} {client.last_name}
            </div>
            {client.email && <div className="text-sm text-gray-600">{client.email}</div>}
            {client.phone && <div className="text-sm text-gray-600">{client.phone}</div>}
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(client)}
            className="px-2 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded"
          >
            Éditer
          </button>
          <button
            onClick={() => onDelete(client)}
            className="px-2 py-1 text-sm text-white bg-red-500 hover:bg-red-600 rounded"
          >
            Supprimer
          </button>
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-500">Taux horaire: {client.hourly_rate}€/h</div>
    </div>
  );
}
