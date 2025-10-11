import React, { useState } from 'react';
import { X } from 'lucide-react';

const JoinTeamDialog = ({ isOpen, onClose, onJoinTeam }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!code.trim()) {
      setError('Le code d\'invitation est requis');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onJoinTeam(code.trim().toUpperCase());
      setCode('');
      onClose();
    } catch (err) {
      const errorMsg = err.message || 'Erreur lors de la tentative de rejoindre l\'équipe';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setCode('');
      setError('');
      onClose();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleCodeChange = (e) => {
    // Auto-uppercase
    setCode(e.target.value.toUpperCase());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-labelledby="join-team-title"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 flex items-center justify-between">
          <h2 id="join-team-title" className="text-xl font-semibold text-white">
            Rejoindre une équipe
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-white/90 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
            aria-label="Fermer"
            data-testid="close-join-team-dialog-btn"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label
              htmlFor="invite-code-input"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Code d'invitation
            </label>
            <input
              id="invite-code-input"
              type="text"
              value={code}
              onChange={handleCodeChange}
              placeholder="ABC12345"
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed font-mono text-lg tracking-wider uppercase"
              maxLength={10}
              autoFocus
              data-testid="invite-code-input"
            />
            <p className="mt-2 text-xs text-gray-500">
              Entrez le code partagé par le propriétaire de l'équipe
            </p>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              data-testid="join-team-error"
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              data-testid="cancel-join-team-btn"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              data-testid="submit-join-team-btn"
            >
              {loading ? 'Vérification...' : 'Rejoindre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JoinTeamDialog;
