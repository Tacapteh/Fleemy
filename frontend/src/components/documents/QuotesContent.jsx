import React from 'react';
import PropTypes from 'prop-types';
import { Quotes as LegacyQuotes } from '../../LegacyApp';

/**
 * Contenu principal pour l'onglet Devis.
 * Réutilise le composant historique afin d'éviter toute régression métier.
 */
export default function QuotesContent({ user, clientId }) {
  // TODO: appliquer un filtrage côté LegacyQuotes lorsque la logique client dédiée sera disponible.
  return <LegacyQuotes user={user} clientId={clientId} />;
}

QuotesContent.propTypes = {
  user: PropTypes.object,
  clientId: PropTypes.string,
};

QuotesContent.defaultProps = {
  user: null,
  clientId: undefined,
};
