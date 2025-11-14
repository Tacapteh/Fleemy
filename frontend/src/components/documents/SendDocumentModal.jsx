import React, { useEffect, useMemo, useRef, useId } from 'react';
import PropTypes from 'prop-types';
import { X } from '../../ui/icons';

const focusableSelectors =
  'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container) {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll(focusableSelectors)).filter(
    (element) => !element.hasAttribute('disabled'),
  );
}

export default function SendDocumentModal({
  isOpen,
  type,
  email,
  defaultEmail,
  subject,
  body,
  status,
  message,
  onClose,
  onEmailChange,
  onSubjectChange,
  onBodyChange,
  onSubmit,
  documentTitle,
}) {
  const modalRef = useRef(null);
  const backdropRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const messageId = useId();

  const isInvoice = type === 'invoice';
  const documentLabel = isInvoice ? 'facture' : 'devis';
  const documentArticle = isInvoice ? 'la' : 'le';
  const sendButtonLabel = `Envoyer ${documentArticle} ${documentLabel}`;
  const descriptionText = `Envoyer ${documentArticle} ${documentLabel} par e-mail au client.`;

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const subjectValue = subject ?? '';
  const bodyValue = body ?? '';

  const describedBy = useMemo(() => {
    if (message) {
      return `${descriptionId} ${messageId}`;
    }
    return descriptionId;
  }, [descriptionId, message, messageId]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previouslyFocused = document.activeElement;
    const node = modalRef.current;

    const focusFirstElement = () => {
      const focusable = getFocusableElements(node);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else if (node) {
        node.focus();
      }
    };

    focusFirstElement();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusableElements(node);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const isShift = event.shiftKey;
      const activeElement = document.activeElement;

      if (isShift && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!isShift && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && previouslyFocused.focus) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleBackdropClick = (event) => {
      if (event.target === backdropRef.current) {
        onClose();
      }
    };

    const backdropNode = backdropRef.current;
    backdropNode?.addEventListener('click', handleBackdropClick);

    return () => {
      backdropNode?.removeEventListener('click', handleBackdropClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const feedbackClasses = isSuccess
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/50 dark:bg-emerald-500/10 dark:text-emerald-200'
    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/50 dark:bg-red-500/10 dark:text-red-200';

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        className="relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl outline-none focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {`Envoyer ${documentArticle} ${documentLabel}`}
            </h2>
            <p
              id={descriptionId}
              className="mt-1 text-sm text-slate-600 dark:text-slate-300"
            >
              {descriptionText}
            </p>
            {documentTitle && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Document : {documentTitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900"
            aria-label="Fermer la fenêtre d'envoi"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-1">
            <label htmlFor={`${titleId}-email`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Adresse e-mail du client
            </label>
            <input
              id={`${titleId}-email`}
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
              placeholder={defaultEmail || 'client@exemple.fr'}
              autoComplete="email"
            />
            {defaultEmail && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adresse suggérée : {defaultEmail}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor={`${titleId}-subject`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Objet du message
            </label>
            <input
              id={`${titleId}-subject`}
              type="text"
              value={subjectValue}
              onChange={(event) => onSubjectChange(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
              placeholder={`Votre ${documentLabel}`}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={`${titleId}-body`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Message du mail
            </label>
            <textarea
              id={`${titleId}-body`}
              value={bodyValue}
              onChange={(event) => onBodyChange(event.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
              placeholder={`Message accompagnant ${documentArticle} ${documentLabel}`}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Modifiez le texte avant l'envoi. Les sauts de ligne sont conservés.
            </p>
          </div>

          {message && (
            <div
              id={messageId}
              className={`rounded-lg border px-3 py-2 text-sm ${feedbackClasses}`}
              role="status"
              aria-live="polite"
            >
              {message}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ email, subject: subjectValue, body: bodyValue })}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus-visible:ring-offset-slate-900"
            aria-label={sendButtonLabel}
            disabled={
              isLoading || email.trim().length === 0 || subjectValue.trim().length === 0
            }
          >
            {isLoading ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}

SendDocumentModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  type: PropTypes.oneOf(['quote', 'invoice']).isRequired,
  email: PropTypes.string.isRequired,
  defaultEmail: PropTypes.string,
  subject: PropTypes.string,
  body: PropTypes.string,
  status: PropTypes.oneOf(['idle', 'loading', 'success', 'error']).isRequired,
  message: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onEmailChange: PropTypes.func.isRequired,
  onSubjectChange: PropTypes.func.isRequired,
  onBodyChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  documentTitle: PropTypes.string,
};

SendDocumentModal.defaultProps = {
  defaultEmail: '',
  subject: '',
  body: '',
  message: '',
  documentTitle: '',
};
