import React, { useState, useEffect } from 'react';
import { X, ClipboardCopy, Check, ExternalLink } from 'lucide-react';

const TeamInviteCodeDialog = ({ isOpen, team, onClose, onOpenTeam }) => {
  const [copied, setCopied] = useState(false);
  const inviteCode = team?.invite_code || team?.inviteCode || '';

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen || !team) return null;

  const handleCopy = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard copy failed', err);
    }
  };

  const handleOpenTeam = () => {
    if (onOpenTeam) {
      onOpenTeam(team);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-invite-code-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 id="team-invite-code-title" className="text-xl font-semibold text-white">
              Code d'invitation
            </h2>
            <p className="text-white/80 text-sm">Partagez ce code pour inviter de nouveaux membres</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/90 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-2">Équipe</p>
            <p className="text-lg font-semibold text-gray-900">{team?.name}</p>
          </div>

          <div className="bg-gray-50 border border-dashed border-emerald-300 rounded-xl p-6 flex flex-col items-center gap-3">
            <p className="text-sm text-emerald-700 uppercase tracking-widest">Code à partager</p>
            <div className="flex items-center gap-3">
              <code className="text-3xl font-bold tracking-widest text-gray-900 font-mono">{inviteCode || '—'}</code>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-full bg-white shadow hover:shadow-md transition-all text-emerald-600 hover:text-emerald-700"
                aria-label="Copier le code d'invitation"
              >
                {copied ? <Check size={20} /> : <ClipboardCopy size={20} />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Le code est valable tant qu'il n'est pas régénéré par le propriétaire de l'équipe.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Fermer
            </button>
            {onOpenTeam && (
              <button
                type="button"
                onClick={handleOpenTeam}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <ExternalLink size={18} />
                Accéder au planning
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamInviteCodeDialog;
