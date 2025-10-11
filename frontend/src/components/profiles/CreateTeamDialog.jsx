import React, { useState } from 'react';
import { X } from 'lucide-react';

const CreateTeamDialog = ({ isOpen, onClose, onCreateTeam }) => {
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!teamName.trim()) {
      setError('Le nom de l\'équipe est requis');
      return;
    }

    if (teamName.trim().length < 2 || teamName.trim().length > 48) {
      setError('Le nom doit contenir entre 2 et 48 caractères');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onCreateTeam(teamName.trim());
      setTeamName('');
      onClose();
    } catch (err) {
      setError(err.message || 'Erreur lors de la création de l\'équipe');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTeamName('');
      setError('');
      onClose();
    }
  };

  // Click outside to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-labelledby="create-team-title"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 flex items-center justify-between">
          <h2 id="create-team-title" className="text-xl font-semibold text-white">
            Créer une équipe
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-white/90 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
            aria-label="Fermer"
            data-testid="close-create-team-dialog-btn"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label
              htmlFor="team-name-input"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Nom de l'équipe
            </label>
            <input
              id="team-name-input"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Mon équipe"
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
              maxLength={48}
              autoFocus
              data-testid="team-name-input"
            />
            <p className="mt-1 text-xs text-gray-500">
              {teamName.length}/48 caractères
            </p>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              data-testid="create-team-error"
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
              data-testid="cancel-create-team-btn"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !teamName.trim()}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              data-testid="submit-create-team-btn"
              aria-live="polite"
            >
              {loading ? "Création de l'équipe…" : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTeamDialog;
