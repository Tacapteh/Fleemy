import React from 'react';

export default function RevenueCards({ revenue }) {
  const { paid = 0, unpaid = 0, pending = 0 } = revenue || {};
  return (
    <div className="grid grid-cols-3 gap-2 my-4">
      <div className="bg-green-100 p-2 rounded text-center">
        <div className="font-bold">{paid}€</div>
        <div className="text-xs">Payé</div>
      </div>
      <div className="bg-red-100 p-2 rounded text-center">
        <div className="font-bold">{unpaid}€</div>
        <div className="text-xs">Impayé</div>
      </div>
      <div className="bg-yellow-100 p-2 rounded text-center">
        <div className="font-bold">{pending}€</div>
        <div className="text-xs">En attente</div>
      </div>
    </div>
  );
}
