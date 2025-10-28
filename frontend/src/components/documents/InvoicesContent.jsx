import React from 'react';
import PropTypes from 'prop-types';
import { Invoices as LegacyInvoices } from '../../LegacyApp';

/**
 * Contenu principal pour l'onglet Factures.
 * Réutilise le composant historique afin de conserver toutes les règles métier.
 */
export default function InvoicesContent({ user, clientId }) {
  // TODO: appliquer un filtrage côté LegacyInvoices lorsque la logique client dédiée sera disponible.
  return <LegacyInvoices user={user} clientId={clientId} />;
}

InvoicesContent.propTypes = {
  user: PropTypes.object,
  clientId: PropTypes.string,
};

InvoicesContent.defaultProps = {
  user: null,
  clientId: undefined,
};
