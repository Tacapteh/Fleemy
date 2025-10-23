import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Users, Plus, LogIn, Share2, Trash2 } from 'lucide-react';
import { auth } from '../firebase';
import { apiFetch } from '../lib/api';
import { contextStore } from '../stores/contextStore';
import CreateTeamDialog from '../components/profiles/CreateTeamDialog';
import JoinTeamDialog from '../components/profiles/JoinTeamDialog';
import TeamInviteCodeDialog from '../components/profiles/TeamInviteCodeDialog';
import {
  readTeamsCache,
  clearTeamsCache,
  ensureTeamsCache,
} from '../utils/teamCache';
import { showToast } from '../utils/toast';

const ProfilePickerPage = () => {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [error, setError] = useState('');
  const [inviteDialogTeam, setInviteDialogTeam] = useState(null);
  const [contextError, setContextError] = useState('');
  const [deletingTeamId, setDeletingTeamId] = useState(null);

  useEffect(() => {
    const selector = 'meta[http-equiv="Cross-Origin-Opener-Policy"]';
    let coopMeta = document.head.querySelector(selector);
    if (!coopMeta) {
      coopMeta = document.createElement('meta');
      coopMeta.setAttribute('http-equiv', 'Cross-Origin-Opener-Policy');
      document.head.prepend(coopMeta);
    }
    coopMeta.setAttribute('content', 'same-origin-allow-popups');
  }, []);

  const loadTeams = useCallback(
    async ({ skipSpinner = false } = {}) => {
      if (!skipSpinner) {
        setLoading(true);
      }

      try {
        const user = auth.currentUser;
        if (!user) {
          navigate('/');
          return null;
        }

        setError('');

        const result = await ensureTeamsCache(
          () => apiFetch('/teams/my'),
          { forceRefresh: true },
        );

        if (result.success) {
          setTeams(Array.isArray(result.teams) ? result.teams : []);
        } else {
          console.error('Error loading teams:', result.raw?.error || result.raw);
          setTeams([]);
          setError(result.raw?.error || 'Erreur lors du chargement des équipes');
          clearTeamsCache();
        }

        return result;
      } catch (err) {
        console.error('Error loading teams:', err);
        setError('Erreur lors du chargement des équipes');
        clearTeamsCache();
        return null;
      } finally {
        if (!skipSpinner) {
          setLoading(false);
        }
      }
    },
    [navigate],
  );

  useEffect(() => {
    let usedCache = false;

    const cachedTeams = readTeamsCache();
    if (cachedTeams) {
      setTeams(cachedTeams);
      setLoading(false);
      usedCache = true;
    }

    loadTeams({ skipSpinner: usedCache });
  }, [loadTeams]);

  const updateLastContext = useCallback(async (contextData) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      setContextError('');

      await apiFetch('/auth/context', {
        method: 'PUT',
        body: JSON.stringify(contextData),
      });
    } catch (err) {
      console.error('Error updating context:', err);
      setContextError('Impossible de mettre à jour le contexte (réseau/CORS). Réessayez.');
    }
  }, []);

  const handleSelectSolo = () => {
    const context = { type: 'solo' };
    contextStore.set(context);
    localStorage.removeItem('teamId');
    localStorage.removeItem('teamName');
    navigate('/me');
    updateLastContext(context);
  };

  const ensureMembershipForUser = async (teamId, user, options = {}) => {
    if (!teamId || !user?.uid) {
      return;
    }

    try {
      await apiFetch(`/teams/${teamId}/memberships/ensure`, {
        method: 'POST',
        body: JSON.stringify({
          include_joined_at: options.includeJoinedAt === true,
        }),
      });
    } catch (err) {
      console.error('Error ensuring membership document:', err);
    }
  };

  const handleSelectTeam = (team) => {
    const user = auth.currentUser;
    if (team?.team_id && user?.uid) {
      ensureMembershipForUser(team.team_id, user);
    }

    const context = {
      type: 'team',
      teamId: team.team_id,
      teamName: team.name,
    };
    contextStore.set(context);
    localStorage.setItem('teamId', team.team_id);
    localStorage.setItem('teamName', team.name);
    navigate(`/team/${team.team_id}`);
    updateLastContext({ type: 'team', team_id: team.team_id });
  };

  const handleDeleteTeam = useCallback(
    async (team) => {
      if (!team?.team_id) {
        return;
      }

      const confirmed = window.confirm(`Supprimer l'équipe "${team.name}" ?`);
      if (!confirmed) {
        return;
      }

      try {
        setError('');
        setContextError('');
        setDeletingTeamId(team.team_id);

        await apiFetch(`/teams/${team.team_id}`, { method: 'DELETE' });

        showToast(`Équipe "${team.name}" supprimée`);
        clearTeamsCache();

        setTeams((currentTeams) =>
          Array.isArray(currentTeams)
            ? currentTeams.filter((current) => current.team_id !== team.team_id)
            : [],
        );

        const currentContext = contextStore.get();
        if (currentContext?.type === 'team' && currentContext.teamId === team.team_id) {
          const soloContext = { type: 'solo' };
          contextStore.set(soloContext);
          localStorage.removeItem('teamId');
          localStorage.removeItem('teamName');
          await updateLastContext(soloContext);
        }

        await loadTeams({ skipSpinner: true });
      } catch (err) {
        console.error('Error deleting team:', err);
        const message = err?.message || "Impossible de supprimer l'équipe";
        setError(message);
        showToast(message, true);
      } finally {
        setDeletingTeamId(null);
      }
    },
    [loadTeams, updateLastContext],
  );

  const handleCreateTeam = async (teamName) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');

      const data = await apiFetch('/teams', {
        method: 'POST',
        body: JSON.stringify({ name: teamName }),
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Erreur lors de la création');
      }

      await ensureMembershipForUser(data.team_id, user, { includeJoinedAt: true });

      clearTeamsCache();
      // Reload teams
      const result = await loadTeams();

      const createdTeam =
        (Array.isArray(result?.teams)
          ? result.teams.find((team) => team.team_id === data.team_id)
          : null) || {
          team_id: data.team_id,
          name: data.name,
          invite_code: data.invite_code,
          owner_uid: user.uid,
          members_count: 1,
        };

      setInviteDialogTeam({
        ...createdTeam,
        invite_code: createdTeam.invite_code || data.invite_code,
      });
    } catch (err) {
      throw err;
    }
  };

  const handleJoinTeam = async (code) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');

      const data = await apiFetch('/teams/join', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Code invalide ou expiré');
      }

      await ensureMembershipForUser(data.team_id, user, {
        includeJoinedAt: !data.already_member,
      });

      clearTeamsCache();
      // Reload teams
      const result = await loadTeams();

      const joinedTeam =
        (Array.isArray(result?.teams)
          ? result.teams.find((team) => team.team_id === data.team_id)
          : null) || {
          team_id: data.team_id,
          name: data.name,
        };

      await handleSelectTeam(joinedTeam);
    } catch (err) {
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
          Qui est-ce ?
        </h1>
        <p className="text-gray-300 text-lg">
          Choisissez votre contexte de travail
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-200 max-w-md">
          {error}
        </div>
      )}

      {contextError && (
        <div className="mb-6 p-4 bg-amber-500/20 border border-amber-400 rounded-lg text-amber-100 max-w-md">
          {contextError}
        </div>
      )}

      {/* Grid de profils */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-5xl w-full mb-8">
        {/* Solo Profile */}
        <button
          onClick={handleSelectSolo}
          className="group relative aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl overflow-hidden hover:ring-4 hover:ring-white/50 transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-white/50 min-h-[160px]"
          data-testid="profile-solo-btn"
          aria-label="Mode Solo"
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 mb-3 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <User size={32} className="text-white" />
            </div>
            <span className="text-white font-semibold text-lg">Moi</span>
            <span className="text-white/80 text-sm mt-1">Solo</span>
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </button>

        {/* Team Profiles */}
        {teams.map((team) => {
          const isOwner = auth.currentUser?.uid && team.owner_uid === auth.currentUser.uid;

          const openInviteDialog = (event) => {
            event?.preventDefault();
            event?.stopPropagation();
            setInviteDialogTeam(team);
          };

          const deleteTeam = (event) => {
            event?.preventDefault();
            event?.stopPropagation();
            handleDeleteTeam(team);
          };

          return (
            <button
              key={team.team_id}
              onClick={() => handleSelectTeam(team)}
              className="group relative aspect-square bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl overflow-hidden hover:ring-4 hover:ring-white/50 transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-white/50 min-h-[160px]"
              data-testid={`profile-team-${team.team_id}-btn`}
              aria-label={`Équipe ${team.name}`}
            >
              <span className="absolute top-3 left-3 z-10 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
                Équipe
              </span>
              {isOwner && team.invite_code && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={openInviteDialog}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      openInviteDialog(e);
                    }
                  }}
                  className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/20 text-white/90 hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  aria-label="Afficher le code d'invitation"
                  data-testid={`team-${team.team_id}-invite-btn`}
                >
                  <Share2 size={18} />
                </span>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={deleteTeam}
                  disabled={deletingTeamId === team.team_id}
                  className="absolute bottom-3 right-3 z-10 p-2 rounded-full bg-white/20 text-white/90 hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label={`Supprimer l'équipe ${team.name}`}
                  data-testid={`team-${team.team_id}-delete-btn`}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 mb-3 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Users size={32} className="text-white" />
                </div>
                <span className="text-white font-semibold text-center text-sm leading-tight line-clamp-2">
                  {team.name}
                </span>
                <span className="text-white/80 text-xs mt-1">
                  {team.members_count} membre{team.members_count > 1 ? 's' : ''}
                </span>
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </button>
          );
        })}

        {/* Create Team */}
        <button
          onClick={() => setShowCreateDialog(true)}
          className="group relative aspect-square bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-2xl overflow-hidden hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-white/50 min-h-[160px]"
          data-testid="create-team-btn"
          aria-label="Créer une équipe"
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 mb-3 bg-white/10 rounded-full flex items-center justify-center">
              <Plus size={32} className="text-white" />
            </div>
            <span className="text-white font-semibold text-center text-sm">
              Créer une équipe
            </span>
          </div>
        </button>

        {/* Join Team */}
        <button
          onClick={() => setShowJoinDialog(true)}
          className="group relative aspect-square bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-2xl overflow-hidden hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-white/50 min-h-[160px]"
          data-testid="join-team-btn"
          aria-label="Rejoindre une équipe"
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 mb-3 bg-white/10 rounded-full flex items-center justify-center">
              <LogIn size={32} className="text-white" />
            </div>
            <span className="text-white font-semibold text-center text-sm">
              Rejoindre une équipe
            </span>
          </div>
        </button>
      </div>

      {/* Dialogs */}
      <CreateTeamDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreateTeam={handleCreateTeam}
      />
      
      <JoinTeamDialog
        isOpen={showJoinDialog}
        onClose={() => setShowJoinDialog(false)}
        onJoinTeam={handleJoinTeam}
      />

      <TeamInviteCodeDialog
        isOpen={Boolean(inviteDialogTeam)}
        team={inviteDialogTeam}
        onClose={() => setInviteDialogTeam(null)}
        onOpenTeam={(teamData) => {
          setInviteDialogTeam(null);
          handleSelectTeam(teamData);
        }}
      />

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-gray-400 text-sm">
          Vous pouvez changer de contexte à tout moment depuis le planning
        </p>
      </div>
    </div>
  );
};

export default ProfilePickerPage;
