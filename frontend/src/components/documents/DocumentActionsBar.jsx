import React from 'react';
import PropTypes from 'prop-types';
import { FileDown, Send } from '../../ui/icons';

const containerClasses =
  'flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 p-2 shadow-sm transition-colors duration-150 dark:border-slate-700/60 dark:bg-slate-800/60';
const actionButtonClasses =
  'inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60';
const exportButtonClasses =
  'bg-slate-900/90 text-white hover:bg-slate-900 focus-visible:ring-slate-500 dark:bg-blue-500 dark:hover:bg-blue-400';
const emailButtonClasses =
  'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

export default function DocumentActionsBar({
  type,
  exporting,
  onExport,
  onEmail,
  className = '',
}) {
  const isInvoice = type === 'invoice';
  const documentLabel = isInvoice ? 'facture' : 'devis';
  const documentArticle = isInvoice ? 'la' : 'le';
  const exportLabel = `Exporter ${documentArticle} ${documentLabel} en PDF`;
  const emailLabel = `Envoyer ${documentArticle} ${documentLabel} par e-mail`;

  return (
    <div className={`${containerClasses} ${className}`}>
      <button
        type="button"
        onClick={onExport}
        className={`${actionButtonClasses} ${exportButtonClasses}`}
        aria-label={exportLabel}
        disabled={exporting}
        aria-busy={exporting ? 'true' : 'false'}
      >
        <FileDown aria-hidden="true" className="h-4 w-4" />
        <span>Exporter PDF</span>
      </button>
      <button
        type="button"
        onClick={onEmail}
        className={`${actionButtonClasses} ${emailButtonClasses}`}
        aria-label={emailLabel}
      >
        <Send aria-hidden="true" className="h-4 w-4" />
        <span>Envoyer par e-mail</span>
      </button>
    </div>
  );
}

DocumentActionsBar.propTypes = {
  type: PropTypes.oneOf(['quote', 'invoice']).isRequired,
  exporting: PropTypes.bool,
  onExport: PropTypes.func.isRequired,
  onEmail: PropTypes.func.isRequired,
  className: PropTypes.string,
};

DocumentActionsBar.defaultProps = {
  exporting: false,
  className: '',
};
