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
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      aria-readonly={readonly ? 'true' : undefined}
      data-testid="client-card"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">👤</span>
            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100" data-testid="client-display-name">
              {client.display_name}
            </h3>
          </div>
          {client.contact_name && (
            <div className="ml-8 text-sm text-gray-600 dark:text-slate-300">
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
      <div className="ml-8 space-y-1 text-sm text-gray-600 dark:text-slate-300">
        {client.email && (
          <div className="flex items-center gap-2">
            <span>📧</span>
            <a href={`mailto:${client.email}`} className="hover:text-blue-600 dark:hover:text-blue-300">
              {client.email}
            </a>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-2">
            <span>📞</span>
            <a href={`tel:${client.phone}`} className="hover:text-blue-600 dark:hover:text-blue-300">
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
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-slate-800">
          <p className="line-clamp-2 text-xs text-gray-500 dark:text-slate-400">
            {client.notes}
          </p>
        </div>
      )}

      {/* Archived badge */}
      {client.is_archived && (
        <div className="mt-2">
          <span className="inline-block rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 dark:bg-slate-800 dark:text-slate-200">
            Archivé
          </span>
        </div>
      )}
    </div>
  );
}
