import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Users, Plus, LogIn, Share2, Trash2 } from 'lucide-react';
import {
  auth,
  db,
  isPermissionDeniedError,
  fetchUserTeamsFromFirestore,
} from '../firebase';
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { apiFetch } from '../lib/api';
import { contextStore } from '../stores/contextStore';
import CreateTeamDialog from '../components/profiles/CreateTeamDialog';
import JoinTeamDialog from '../components/profiles/JoinTeamDialog';
import TeamInviteCodeDialog from '../components/profiles/TeamInviteCodeDialog';
import {
  readTeamsCache,
  clearTeamsCache,
  writeTeamsCache,
  normalizeTeamsResponse,
} from '../utils/teamCache';
import { showToast } from '../utils/toast';

const DEFAULT_TEAM_NAME = 'Equipe sans nom';

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

  const normalizeTeamDoc = (docSnap) => {
    if (!docSnap) {
      return null;
    }
    const exists =
      typeof docSnap.exists === 'function' ? docSnap.exists() : Boolean(docSnap.exists);
    if (!exists) {
      return null;
    }
    const data = typeof docSnap.data === 'function' ? docSnap.data() : {};
    const members = Array.isArray(data.members) ? data.members : [];
    const fallbackCount =
      typeof data.members_count === 'number'
        ? data.members_count
        : typeof data.membersCount === 'number'
        ? data.membersCount
        : members.length;

    return {
      team_id: docSnap.id,
      name: data.name || DEFAULT_TEAM_NAME,
      owner_uid: data.owner_uid || data.ownerUid || null,
      invite_code: data.invite_code || data.inviteCode || null,
      members_count: fallbackCount,
    };
  };

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) {
      return;
    }

    const selector = 'meta[http-equiv="Cross-Origin-Opener-Policy"]';
    let coopMeta = head.querySelector(selector);
    if (!coopMeta) {
      coopMeta = document.createElement('meta');
      coopMeta.setAttribute('http-equiv', 'Cross-Origin-Opener-Policy');

      const firstChild = head.firstChild;
      if (typeof head.prepend === 'function') {
        head.prepend(coopMeta);
      } else if (firstChild) {
        head.insertBefore(coopMeta, firstChild);
      } else {
        head.appendChild(coopMeta);
      }
    }
    coopMeta.setAttribute('content', 'same-origin-allow-popups');
  }, []);

  const API_TEAM_FETCH_TIMEOUT_MS = 8000;

  const fetchTeamsList = useCallback(
    async (options = {}) => {
      const {
        skipStartLoading = false,
        silent = false,
        shouldUpdate = () => true,
      } = options;

      if (!skipStartLoading && shouldUpdate()) {
        setLoading(true);
      }

      let source = 'api';
      const hasWindow = typeof window !== 'undefined';
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId =
        controller && hasWindow && API_TEAM_FETCH_TIMEOUT_MS > 0
          ? window.setTimeout(() => {
              try {
                controller.abort();
              } catch {
                /* ignore abort errors */
              }
            }, API_TEAM_FETCH_TIMEOUT_MS)
          : null;

      try {
        const response = await apiFetch('/teams/my', {
          signal: controller?.signal,
        });
        const teamsPayload = normalizeTeamsResponse(response);
        if (!Array.isArray(teamsPayload)) {
          throw new Error('Invalid response');
        }

        const nextTeams = teamsPayload
          .map((team) => ({
            team_id: team.team_id || team.id || null,
            name: team.name || DEFAULT_TEAM_NAME,
            owner_uid: team.owner_uid || team.ownerUid || null,
            invite_code: team.invite_code || team.inviteCode || null,
            members_count: typeof team.members_count === 'number'
              ? team.members_count
              : Array.isArray(team.members)
              ? team.members.length
              : 0,
          }))
          .filter((team) => typeof team.team_id === 'string' && team.team_id.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

        if (shouldUpdate()) {
          setTeams(nextTeams);
          setError('');
          writeTeamsCache(nextTeams);
        }
      } catch (apiError) {
        if (apiError?.name === 'AbortError') {
          if (!silent) {
            console.warn('API teams fetch aborted, falling back to Firestore');
          }
        } else {
          console.error('Failed to fetch teams via API', apiError);
        }
        source = 'firestore';
        let fallbackTeams = [];
        let fallbackFailed = false;
        try {
          fallbackTeams = await fetchUserTeamsFromFirestore();
        } catch (fallbackError) {
          console.warn('Fallback Firestore teams fetch failed', fallbackError);
          fallbackFailed = true;
        }

        const normalizedFallback = Array.isArray(fallbackTeams)
          ? fallbackTeams
              .map((team) => ({
                team_id: team.team_id || team.id || null,
                name: team.name || DEFAULT_TEAM_NAME,
                owner_uid: team.owner_uid || team.ownerUid || null,
                invite_code: team.invite_code || team.inviteCode || null,
                members_count:
                  typeof team.members_count === 'number'
                    ? team.members_count
                    : Array.isArray(team.members)
                    ? team.members.length
                    : 0,
              }))
              .filter((team) => typeof team.team_id === 'string' && team.team_id.length > 0)
              .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
          : [];

        if (shouldUpdate()) {
          if (normalizedFallback.length > 0) {
            setTeams(normalizedFallback);
            setError('');
            writeTeamsCache(normalizedFallback);
          } else if (fallbackFailed && !silent) {
            setTeams([]);
            setError("Impossible de charger vos équipes pour l'instant");
            clearTeamsCache();
          } else {
            setTeams([]);
            if (!silent) {
              setError('');
            }
            if (!fallbackFailed) {
              writeTeamsCache([]);
            }
          }
        }
      } finally {
        if (hasWindow && timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (shouldUpdate()) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const cachedTeams = readTeamsCache();
    const hasCachedTeams = Array.isArray(cachedTeams) && cachedTeams.length > 0;

    if (hasCachedTeams) {
      setTeams(cachedTeams);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let active = true;
    let unsubscribeTeams = null;

    const stopTeamsListener = () => {
      if (typeof unsubscribeTeams === 'function') {
        unsubscribeTeams();
        unsubscribeTeams = null;
      }
    };

    const hydrateTeamsFromFetcher = () =>
      fetchTeamsList({
        skipStartLoading: true,
        silent: true,
        shouldUpdate: () => active,
      });

    const subscribeToTeams = async (user) => {
      stopTeamsListener();

      if (!user) {
        if (!active) {
          return;
        }
        setTeams([]);
        setLoading(false);
        setError('');
        navigate('/');
        return;
      }

      if (active) {
        if (!hasCachedTeams) {
          setLoading(true);
        }
        setError('');
      }

      hydrateTeamsFromFetcher();

      try {
        const membershipCollectionCandidates = [
          {
            name: 'members',
            buildQueries: (col) => [query(col, where('uid', '==', user.uid))],
          },
          {
            name: 'memberships',
            buildQueries: (col) => [query(col, where('uid', '==', user.uid))],
          },
        ];
        let membershipsQuery = null;
        let membershipAccessDenied = false;

        for (const { name, buildQueries } of membershipCollectionCandidates) {
          let queries = [];
          try {
            queries =
              typeof buildQueries === 'function'
                ? buildQueries(collectionGroup(db, name))
                : [];
          } catch (collectionError) {
            if (isPermissionDeniedError(collectionError)) {
              membershipAccessDenied = true;
              break;
            }
            console.warn(
              `Unable to prepare ${name} membership query`,
              collectionError,
            );
            continue;
          }

          for (const candidateQuery of queries) {
            let snapshot = null;
            try {
              snapshot = await getDocs(candidateQuery);
              if (!active) {
                return;
              }
            } catch (membershipError) {
              if (isPermissionDeniedError(membershipError)) {
                membershipAccessDenied = true;
                break;
              }
              console.warn(
                `Unable to prefetch ${name} memberships`,
                membershipError,
              );
            }

            if (!membershipsQuery) {
              membershipsQuery = candidateQuery;
            }

            if (snapshot && !snapshot.empty) {
              membershipsQuery = candidateQuery;
              break;
            }
          }

          if (membershipAccessDenied || membershipsQuery) {
            break;
          }
        }

        if (membershipAccessDenied) {
          hydrateTeamsFromFetcher();
          return;
        }

        if (!membershipsQuery) {
          hydrateTeamsFromFetcher();
          return;
        }

        let latestSnapshotId = 0;

        const extractMembershipEntries = (snapshot) =>
          snapshot.docs
            .map((docSnap) => {
              const teamRef = docSnap?.ref?.parent?.parent || null;
              let teamId = teamRef?.id || null;

              if (!teamId) {
                try {
                  const membershipData =
                    typeof docSnap.data === 'function' ? docSnap.data() : {};
                  teamId = membershipData?.team_id || membershipData?.teamId || null;
                } catch {
                  teamId = null;
                }
              }

              if (!teamId) {
                return null;
              }

              return {
                teamId,
                teamRef: teamRef || doc(db, 'teams', teamId),
              };
            })
            .filter(Boolean);

        const handleSnapshot = (snapshot) => {
          latestSnapshotId += 1;
          const currentSnapshotId = latestSnapshotId;

          const processSnapshot = async () => {
            const membershipEntries = extractMembershipEntries(snapshot);

            if (membershipEntries.length === 0) {
              hydrateTeamsFromFetcher();
              return;
            }

            const uniqueTeamRefs = new Map();
            membershipEntries.forEach(({ teamId, teamRef }) => {
              if (teamId && !uniqueTeamRefs.has(teamId)) {
                uniqueTeamRefs.set(teamId, teamRef);
              }
            });

            if (uniqueTeamRefs.size === 0) {
              hydrateTeamsFromFetcher();
              return;
            }

            const resolvedTeams = await Promise.all(
              Array.from(uniqueTeamRefs.entries()).map(async ([teamId, teamRef]) => {
                try {
                  const teamSnap = await getDoc(teamRef);
                  return teamSnap;
                } catch (teamError) {
                  console.warn(`Unable to fetch team ${teamId}`, teamError);
                  return null;
                }
              }),
            );

            if (!active || currentSnapshotId !== latestSnapshotId) {
              return;
            }

            const nextTeams = resolvedTeams
              .map((teamSnap) => normalizeTeamDoc(teamSnap))
              .filter(Boolean)
              .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

            if (nextTeams.length === 0) {
              hydrateTeamsFromFetcher();
              return;
            }

            setTeams(nextTeams);
            setLoading(false);
            setError('');
            writeTeamsCache(nextTeams);
          };

          processSnapshot().catch((processingError) => {
            if (!active) {
              return;
            }
            console.error(
              'Unable to hydrate teams from memberships snapshot',
              processingError,
            );
            hydrateTeamsFromFetcher();
          });
        };

        unsubscribeTeams = onSnapshot(
          membershipsQuery,
          (snapshot) => {
            if (!active) {
              return;
            }
            handleSnapshot(snapshot);
          },
          (snapshotError) => {
            if (!active) {
              return;
            }

            if (isPermissionDeniedError(snapshotError)) {
              console.warn('Firestore membership subscription permission denied', snapshotError);
              stopTeamsListener();
              hydrateTeamsFromFetcher();
              return;
            }

            console.error('Firestore membership subscription error', snapshotError);
            hydrateTeamsFromFetcher();
          },
        );
      } catch (subscriptionError) {
        if (isPermissionDeniedError(subscriptionError)) {
          console.warn('Skipping Firestore membership subscription (permission denied)');
          hydrateTeamsFromFetcher();
          return;
        }

        console.error('Failed to subscribe to teams', subscriptionError);
        hydrateTeamsFromFetcher();
      }
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!active) {
        return;
      }
      subscribeToTeams(user);
    });

    if (auth.currentUser) {
      subscribeToTeams(auth.currentUser);
    }

    return () => {
      active = false;
      stopTeamsListener();
      if (typeof unsubscribeAuth === 'function') {
        unsubscribeAuth();
      }
    };
  }, [fetchTeamsList, navigate]);

  useEffect(() => {
    let active = true;
    let unsubscribeAuth = null;
    let lastFetchedUid = null;

    const cachedTeams = readTeamsCache();
    const hasCachedTeams = Array.isArray(cachedTeams) && cachedTeams.length > 0;

    const ensureInitialTeams = (user) => {
      if (!user?.uid || lastFetchedUid === user.uid) {
        return;
      }

      lastFetchedUid = user.uid;

      fetchTeamsList({
        skipStartLoading: hasCachedTeams,
        silent: hasCachedTeams,
        shouldUpdate: () => active,
      });
    };

    if (auth.currentUser) {
      ensureInitialTeams(auth.currentUser);
    }

    unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!active) {
        return;
      }
      ensureInitialTeams(user);
    });

    return () => {
      active = false;
      if (typeof unsubscribeAuth === 'function') {
        unsubscribeAuth();
      }
    };
  }, [fetchTeamsList]);

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

      } catch (err) {
        console.error('Error deleting team:', err);
        const message = err?.message || "Impossible de supprimer l'équipe";
        setError(message);
        showToast(message, true);
      } finally {
        setDeletingTeamId(null);
      }
    },
    [updateLastContext],
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

      try {
        await ensureMembershipForUser(data.team_id, user, { includeJoinedAt: true });
      } catch (membershipError) {
        console.warn('Unable to ensure membership after team creation', membershipError);
      }

      const newTeam = {
        team_id: data.team_id,
        name: data.name || teamName,
        invite_code: data.invite_code,
        owner_uid: user.uid,
        members_count: 1,
      };

      clearTeamsCache();
      setTeams((currentTeams) => {
        const baseTeams = Array.isArray(currentTeams) ? currentTeams : [];
        const exists = baseTeams.some((team) => team.team_id === newTeam.team_id);
        if (exists) {
          return baseTeams;
        }
        return [...baseTeams, newTeam];
      });

      setInviteDialogTeam(newTeam);
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

      try {
        await ensureMembershipForUser(data.team_id, user, {
          includeJoinedAt: !data.already_member,
        });
      } catch (membershipError) {
        console.warn('Unable to ensure membership after joining team', membershipError);
      }

      clearTeamsCache();
      await handleSelectTeam({
        team_id: data.team_id,
        name: data.name,
      });
    } catch (err) {
      throw err;
    }
  };

  const isInitialLoading = loading && teams.length === 0;

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

      {isInitialLoading && !error && (
        <div className="mb-8 flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <span className="h-2 w-2 animate-ping rounded-full bg-white/70" aria-hidden />
          <span>Chargement des profils…</span>
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
            if (deletingTeamId === team.team_id) {
              event?.preventDefault();
              event?.stopPropagation();
              return;
            }

            event?.preventDefault();
            event?.stopPropagation();
            handleDeleteTeam(team);
          };

          const actionButtonBase =
            'p-2 rounded-full bg-white/20 text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';
          const deleteButtonClass = `${actionButtonBase} ${
            deletingTeamId === team.team_id
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:bg-white/30'
          }`;

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
              {isOwner && (
                <>
                  {team.invite_code && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={openInviteDialog}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          openInviteDialog(e);
                        }
                      }}
                      className={`absolute top-3 right-3 z-10 ${actionButtonBase} hover:bg-white/30`}
                      aria-label="Afficher le code d'invitation"
                      data-testid={`team-${team.team_id}-invite-btn`}
                    >
                      <Share2 size={18} />
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={deleteTeam}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        deleteTeam(e);
                      }
                    }}
                    className={`absolute bottom-3 right-3 z-10 ${deleteButtonClass}`}
                    aria-label={`Supprimer l'équipe ${team.name}`}
                    aria-disabled={deletingTeamId === team.team_id}
                    data-testid={`team-${team.team_id}-delete-btn`}
                  >
                    <Trash2 size={18} />
                  </span>
                </>
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

        {isInitialLoading && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/30 bg-white/10 p-6 text-center text-white/80">
            <div className="mb-3 h-12 w-12 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
            <p className="text-sm">Chargement des équipes…</p>
          </div>
        )}

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
