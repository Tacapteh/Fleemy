import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Invoices as LegacyInvoices } from '../../LegacyApp';
import DocumentActionsBar from './DocumentActionsBar';
import SendDocumentModal from './SendDocumentModal';
import {
  downloadDocumentPdf,
  sendDocumentByEmail,
  buildDocumentEmailContent,
} from '../../utils/documents';
import { useSettings } from '../../context/SettingsContext';
import { showToast } from '../../utils/toast';

const INITIAL_MODAL_STATE = {
  open: false,
  document: null,
  email: '',
  defaultEmail: '',
  subject: '',
  body: '',
  templateBody: '',
  status: 'idle',
  message: '',
  documentTitle: '',
};

/**
 * Contenu principal pour l'onglet Factures.
 * Réutilise le composant historique afin de conserver toutes les règles métier.
 */
export default function InvoicesContent({
  user,
  clientId,
  onRegisterCreateHandler,
}) {
  const { settings } = useSettings();
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

    const preferredFilename = document?.invoice_number || document?.title || '';

    try {
      await downloadDocumentPdf({
        id: identifier,
        type: 'invoice',
        filename: preferredFilename,
      });
      showToast('Export de la facture prêt à être téléchargé');
    } catch (error) {
      console.error('Erreur lors du téléchargement de la facture', error);
      showToast("Erreur lors de l'export de la facture", true);
    } finally {
      markExporting(identifier, false);
    }
  }, [markExporting]);

  const openEmailModal = useCallback(
    (document, defaultEmailValue = '') => {
      if (!document) {
        return;
      }

      const template = buildDocumentEmailContent({
        document,
        type: 'invoice',
        subjectTemplate: settings?.emailSubjectTemplate,
        bodyTemplate: settings?.emailBodyTemplate,
      });

      setEmailModalState({
        open: true,
        document,
        email: defaultEmailValue || '',
        defaultEmail: defaultEmailValue || '',
        subject: template.subject,
        body: template.body,
        templateBody: template.body,
        status: 'idle',
        message: '',
        documentTitle: document?.invoice_number || document?.title || '',
      });
    },
    [settings],
  );

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

  const handleSubjectChange = useCallback((value) => {
    setEmailModalState((prev) => ({
      ...prev,
      subject: value,
      status: 'idle',
      message: '',
    }));
  }, []);

  const handleBodyChange = useCallback((value) => {
    setEmailModalState((prev) => ({
      ...prev,
      body: value,
      status: 'idle',
      message: '',
    }));
  }, []);

  const handleEmailSubmit = useCallback(
    async ({ email: value, subject: subjectValue, body: bodyValue }) => {
      const activeDocument = emailModalState.document;
      if (!activeDocument?.id) {
        return;
      }

      const trimmedEmail = (value || '').trim();
      if (!trimmedEmail) {
        setEmailModalState((prev) => ({
          ...prev,
          status: 'error',
          message: "L'adresse e-mail est requise",
        }));
        return;
      }

      const trimmedSubject = (subjectValue || '').trim();
      if (!trimmedSubject) {
        setEmailModalState((prev) => ({
          ...prev,
          status: 'error',
          message: "L'objet du mail est requis",
        }));
        return;
      }

      const normalizedBodyInput =
        typeof bodyValue === 'string' ? bodyValue.replace(/\r\n/g, '\n') : '';
      const hasCustomBody = normalizedBodyInput.trim().length > 0;
      const resolvedBody = hasCustomBody
        ? normalizedBodyInput
        : emailModalState.templateBody || emailModalState.body || '';

      setEmailModalState((prev) => ({
        ...prev,
        status: 'loading',
        message: '',
        email: trimmedEmail,
        subject: trimmedSubject,
        body: hasCustomBody ? normalizedBodyInput : prev.templateBody,
      }));

      try {
        const response = await sendDocumentByEmail({
          id: String(activeDocument.id),
          type: 'invoice',
          to: trimmedEmail,
          subject: trimmedSubject,
          body: resolvedBody,
        });
        const sentTo = response?.sentTo || trimmedEmail;
        setEmailModalState((prev) => ({
          ...prev,
          status: 'success',
          message: `E-mail envoyé à ${sentTo}`,
          email: trimmedEmail,
          subject: trimmedSubject,
          body: hasCustomBody ? normalizedBodyInput : prev.templateBody,
        }));
        showToast(`Facture envoyée à ${sentTo}`);
      } catch (error) {
        const errorMessage =
          error?.message || "Erreur lors de l'envoi de l'e-mail";
        console.error("Erreur lors de l'envoi de la facture par e-mail", error);
        setEmailModalState((prev) => ({
          ...prev,
          status: 'error',
          message: errorMessage,
          email: trimmedEmail,
          subject: trimmedSubject,
          body: hasCustomBody ? normalizedBodyInput : prev.templateBody,
        }));
        showToast(errorMessage, true);
      }
    },
    [emailModalState.body, emailModalState.document, emailModalState.templateBody],
  );

  const renderDocumentActions = useCallback(
    ({ document, defaultEmail }) => (
      <DocumentActionsBar
        type="invoice"
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
    return doc.invoice_number || doc.title || '';
  }, [emailModalState.document, emailModalState.documentTitle]);

  return (
    <>
      <LegacyInvoices
        user={user}
        clientId={clientId}
        onRegisterCreateHandler={onRegisterCreateHandler}
        renderDocumentActions={renderDocumentActions}
      />
      <SendDocumentModal
        isOpen={emailModalState.open}
        type="invoice"
        email={emailModalState.email}
        defaultEmail={emailModalState.defaultEmail}
        subject={emailModalState.subject}
        body={emailModalState.body}
        status={emailModalState.status}
        message={emailModalState.message}
        onClose={closeEmailModal}
        onEmailChange={handleEmailChange}
        onSubjectChange={handleSubjectChange}
        onBodyChange={handleBodyChange}
        onSubmit={handleEmailSubmit}
        documentTitle={modalDocumentTitle}
      />
    </>
  );
}

InvoicesContent.propTypes = {
  user: PropTypes.object,
  clientId: PropTypes.string,
  onRegisterCreateHandler: PropTypes.func,
};

InvoicesContent.defaultProps = {
  user: null,
  clientId: undefined,
  onRegisterCreateHandler: undefined,
};
