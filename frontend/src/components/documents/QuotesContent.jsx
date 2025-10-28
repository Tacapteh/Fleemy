import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Quotes as LegacyQuotes } from '../../LegacyApp';
import DocumentActionsBar from './DocumentActionsBar';
import SendDocumentModal from './SendDocumentModal';
import { downloadDocumentPdf, sendDocumentByEmail } from '../../utils/documents';
import { showToast } from '../../utils/toast';

const INITIAL_MODAL_STATE = {
  open: false,
  document: null,
  email: '',
  defaultEmail: '',
  status: 'idle',
  message: '',
  documentTitle: '',
};

/**
 * Contenu principal pour l'onglet Devis.
 * Réutilise le composant historique afin d'éviter toute régression métier.
 */
export default function QuotesContent({
  user,
  clientId,
  onRegisterCreateHandler,
}) {
  const [exportingIds, setExportingIds] = useState(() => new Set());
  const [emailModalState, setEmailModalState] = useState(() => ({
    ...INITIAL_MODAL_STATE,
  }));

  const markExporting = useCallback((documentId, active) => {
    setExportingIds((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(documentId);
      } else {
        next.delete(documentId);
      }
      return next;
    });
  }, []);

  const handleExport = useCallback(async (document) => {
    if (!document?.id) {
      return;
    }

    const identifier = String(document.id);
    markExporting(identifier, true);

    const preferredFilename = document?.quote_number || document?.title || '';

    try {
      await downloadDocumentPdf({
        id: identifier,
        type: 'quote',
        filename: preferredFilename,
      });
      showToast('Export du devis prêt à être téléchargé');
    } catch (error) {
      console.error('Erreur lors du téléchargement du devis', error);
      showToast("Erreur lors de l'export du devis", true);
    } finally {
      markExporting(identifier, false);
    }
  }, [markExporting]);

  const openEmailModal = useCallback((document, defaultEmailValue = '') => {
    if (!document) {
      return;
    }

    setEmailModalState({
      open: true,
      document,
      email: defaultEmailValue || '',
      defaultEmail: defaultEmailValue || '',
      status: 'idle',
      message: '',
      documentTitle: document?.quote_number || document?.title || '',
    });
  }, []);

  const closeEmailModal = useCallback(() => {
    setEmailModalState({ ...INITIAL_MODAL_STATE });
  }, []);

  const handleEmailChange = useCallback((value) => {
    setEmailModalState((prev) => ({
      ...prev,
      email: value,
      status: 'idle',
      message: '',
    }));
  }, []);

  const handleEmailSubmit = useCallback(
    async (value) => {
      const activeDocument = emailModalState.document;
      if (!activeDocument?.id) {
        return;
      }

      const trimmedEmail = value.trim();
      if (!trimmedEmail) {
        setEmailModalState((prev) => ({
          ...prev,
          status: 'error',
          message: "L'adresse e-mail est requise",
        }));
        return;
      }

      setEmailModalState((prev) => ({
        ...prev,
        status: 'loading',
        message: '',
        email: trimmedEmail,
      }));

      try {
        const response = await sendDocumentByEmail({
          id: String(activeDocument.id),
          type: 'quote',
          to: trimmedEmail,
        });
        const sentTo = response?.sentTo || trimmedEmail;
        setEmailModalState((prev) => ({
          ...prev,
          status: 'success',
          message: `E-mail envoyé à ${sentTo}`,
          email: trimmedEmail,
        }));
        showToast(`Devis envoyé à ${sentTo}`);
      } catch (error) {
        const errorMessage =
          error?.message || "Erreur lors de l'envoi de l'e-mail";
        console.error('Erreur lors de l\'envoi du devis par e-mail', error);
        setEmailModalState((prev) => ({
          ...prev,
          status: 'error',
          message: errorMessage,
          email: trimmedEmail,
        }));
        showToast(errorMessage, true);
      }
    },
    [emailModalState.document],
  );

  const renderDocumentActions = useCallback(
    ({ document, defaultEmail }) => (
      <DocumentActionsBar
        type="quote"
        exporting={exportingIds.has(document.id)}
        onExport={() => handleExport(document)}
        onEmail={() => openEmailModal(document, defaultEmail)}
        className="bg-slate-100/80 dark:bg-slate-800/60"
      />
    ),
    [exportingIds, handleExport, openEmailModal],
  );

  const modalDocumentTitle = useMemo(() => {
    if (emailModalState.documentTitle) {
      return emailModalState.documentTitle;
    }
    const doc = emailModalState.document;
    if (!doc) {
      return '';
    }
    return doc.quote_number || doc.title || '';
  }, [emailModalState.document, emailModalState.documentTitle]);

  return (
    <>
      <LegacyQuotes
        user={user}
        clientId={clientId}
        onRegisterCreateHandler={onRegisterCreateHandler}
        renderDocumentActions={renderDocumentActions}
      />
      <SendDocumentModal
        isOpen={emailModalState.open}
        type="quote"
        email={emailModalState.email}
        defaultEmail={emailModalState.defaultEmail}
        status={emailModalState.status}
        message={emailModalState.message}
        onClose={closeEmailModal}
        onEmailChange={handleEmailChange}
        onSubmit={handleEmailSubmit}
        documentTitle={modalDocumentTitle}
      />
    </>
  );
}

QuotesContent.propTypes = {
  user: PropTypes.object,
  clientId: PropTypes.string,
  onRegisterCreateHandler: PropTypes.func,
};

QuotesContent.defaultProps = {
  user: null,
  clientId: undefined,
  onRegisterCreateHandler: undefined,
};
