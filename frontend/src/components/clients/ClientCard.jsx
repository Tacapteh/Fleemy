import React from 'react';

export default function ClientCard({ client, onEdit, onDelete, readOnly }) {
  const readonly = readOnly;
  
  // Format address for display
  const formatAddress = (address) => {
    if (!address) return null;
    const parts = [
      address.line1,
      address.line2,
      `${address.postal_code} ${address.city}`.trim(),
      address.country
    ].filter(Boolean);
    return parts.join(', ');
  };
  
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
      aria-readonly={readonly ? 'true' : undefined}
      data-testid="client-card"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">👤</span>
            <h3 className="font-bold text-lg text-gray-800" data-testid="client-display-name">
              {client.display_name}
            </h3>
          </div>
          {client.contact_name && (
            <div className="text-sm text-gray-600 ml-8">
              Contact: {client.contact_name}
            </div>
          )}
        </div>
        
        {!readonly && (
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(client)}
              className="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
              data-testid="client-edit-button"
              aria-label={`Éditer ${client.display_name}`}
            >
              Éditer
            </button>
            <button
              onClick={() => onDelete(client)}
              className="px-3 py-1 text-sm text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
              data-testid="client-delete-button"
              aria-label={`Supprimer ${client.display_name}`}
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
      
      {/* Contact info */}
      <div className="space-y-1 text-sm text-gray-600 ml-8">
        {client.email && (
          <div className="flex items-center gap-2">
            <span>📧</span>
            <a href={`mailto:${client.email}`} className="hover:text-blue-600">
              {client.email}
            </a>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-2">
            <span>📞</span>
            <a href={`tel:${client.phone}`} className="hover:text-blue-600">
              {client.phone}
            </a>
          </div>
        )}
        {client.address && formatAddress(client.address) && (
          <div className="flex items-start gap-2">
            <span>📍</span>
            <span>{formatAddress(client.address)}</span>
          </div>
        )}
      </div>
      
      {/* Notes preview */}
      {client.notes && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 line-clamp-2">
            {client.notes}
          </p>
        </div>
      )}
      
      {/* Archived badge */}
      {client.is_archived && (
        <div className="mt-2">
          <span className="inline-block px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded">
            Archivé
          </span>
        </div>
      )}
    </div>
  );
}
