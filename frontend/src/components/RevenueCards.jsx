import React from 'react';
import StatusSummaryCard from '../ui/StatusSummaryCard';

/**
 * RevenueCards - Affichage des revenus par statut
 * Utilise StatusSummaryCard pour une harmonie visuelle avec le design system v1
 */
export default function RevenueCards({ revenue }) {
  const { paid = 0, unpaid = 0, pending = 0 } = revenue || {};
  
  return (
    <div className="grid grid-cols-3 gap-3 my-4">
      <StatusSummaryCard
        variant="success"
        label="Payé"
        amount={`${paid}€`}
        data-testid="revenue-card-paid"
      />
      <StatusSummaryCard
        variant="danger"
        label="Impayé"
        amount={`${unpaid}€`}
        data-testid="revenue-card-unpaid"
      />
      <StatusSummaryCard
        variant="warning"
        label="En attente"
        amount={`${pending}€`}
        data-testid="revenue-card-pending"
      />
    </div>
  );
}
