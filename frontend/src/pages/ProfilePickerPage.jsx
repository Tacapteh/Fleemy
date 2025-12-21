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
  collection,
  collectionGroup,
  doc,
  documentId,
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
  readStaleTeamsCache,
  clearTeamsCache,
  writeTeamsCache,
  normalizeTeamsResponse,
  removeTeamFromCache,
  ensureTeamsCache,
} from '../utils/teamCache';
import { showToast } from '../utils/toast';

const DEFAULT_TEAM_NAME = 'Equipe sans nom';
const FRIENDLY_EMPTY_STATE_MESSAGE =
  "Aucune équipe n'est disponible pour le moment. Créez-en une ou rejoignez une équipe existante pour commencer.";

const ProfilePickerPage = () => {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInitialSnapshotLoaded, setIsInitialSnapshotLoaded] = useState(false);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(false);
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

  const fetchTeamsList = useCallback(
    async (options = {}) => {
      const {
        skipStartLoading = false,
        silent = false,
        shouldUpdate = () => true,
      } = options;

      const persistedTeams = readStaleTeamsCache() || [];

      const mapTeams = (payload) =>
        payload
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
          .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

      if (!skipStartLoading && shouldUpdate()) {
        setLoading(true);
      }

      const safetyTimeout = setTimeout(() => {
        if (!shouldUpdate()) {
          return;
        }

        if (persistedTeams.length > 0) {
          setTeams(mapTeams(persistedTeams));
          writeTeamsCache(persistedTeams);
          setError('');
        }
        setLoading(false);
      }, 60000);

      try {
        console.log('[ProfilePickerPage] Calling apiFetch(/teams/my)...');
        const result = await ensureTeamsCache(() => apiFetch('/teams/my'));
        const teamsPayload = Array.isArray(result?.teams)
          ? result.teams
          : normalizeTeamsResponse(result?.raw);

        if (!Array.isArray(teamsPayload)) {
          throw new Error('Invalid response');
        }

        const nextTeams = mapTeams(teamsPayload);
        console.log('[ProfilePickerPage] API found teams:', nextTeams.length);

        if (shouldUpdate()) {
          setTeams(nextTeams);

          const shouldSurfaceError =
            result?.success === false &&
            !silent &&
            (!Array.isArray(nextTeams) || nextTeams.length === 0);

          if (shouldSurfaceError) {
            setError(result?.error || 'Erreur lors du chargement des équipes');
          } else {
            setError('');
          }
        }
      } catch (apiError) {
        console.error('[ProfilePickerPage] Failed to fetch teams via API', apiError);

        let fallbackTeams = [];
        try {
          fallbackTeams = await fetchUserTeamsFromFirestore();
        } catch (fallbackError) {
          console.warn('[ProfilePickerPage] Fallback Firestore teams fetch failed', fallbackError);
        }

        const normalizedFallback = Array.isArray(fallbackTeams)
          ? mapTeams(fallbackTeams)
          : [];

        if (shouldUpdate()) {
          if (normalizedFallback.length > 0) {
            setTeams(normalizedFallback);
            setError('');
            writeTeamsCache(normalizedFallback);
          } else if (persistedTeams.length > 0) {
            const mappedTeams = mapTeams(persistedTeams);
            setTeams(mappedTeams);
            setError(!silent && mappedTeams.length === 0 ? FRIENDLY_EMPTY_STATE_MESSAGE : '');
          } else {
            setTeams([]);
            if (!silent) {
              setError('');
            }
            clearTeamsCache();
          }
        }
      } finally {
        clearTimeout(safetyTimeout);
        if (shouldUpdate()) {
          if (isInitialSnapshotLoaded) {
            setLoading(false);
          }
          setIsInitialSyncComplete(true);
        }
      }
    },
    [isInitialSnapshotLoaded],
  );

  useEffect(() => {
    const cachedTeams = readTeamsCache() || readStaleTeamsCache();
    const hasCachedTeams = Array.isArray(cachedTeams) && cachedTeams.length > 0;

    if (hasCachedTeams) {
      setTeams(cachedTeams);
      setLoading(false);
      setIsInitialSnapshotLoaded(true);
      setIsInitialSyncComplete(true);
    } else {
      setLoading(true);
      setIsInitialSnapshotLoaded(false);
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
      console.log('[ProfilePickerPage] subscribeToTeams for UID:', user?.uid);
      stopTeamsListener();

      if (!user) {
        console.warn('[ProfilePickerPage] No user authenticated, redirecting...');
        if (!active) {
          return;
        }
        setTeams([]);
        setLoading(false);
        setError('');
        setIsInitialSnapshotLoaded(true);
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
            buildQueries: (col) => [
              query(col, where('uid', '==', user.uid))
            ],
          },
          {
            name: 'memberships',
            buildQueries: (col) => [
              query(col, where('uid', '==', user.uid))
            ],
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
            console.warn(`[ProfilePickerPage] Unable to prepare ${name} membership query`, collectionError);
            continue;
          }

          for (const candidateQuery of queries) {
            let snapshot = null;
            try {
              snapshot = await getDocs(candidateQuery);
              if (!active) return;
            } catch (membershipError) {
              if (isPermissionDeniedError(membershipError)) {
                membershipAccessDenied = true;
                break;
              }
              console.warn(`[ProfilePickerPage] Unable to prefetch ${name} memberships`, membershipError);
            }

            if (!membershipsQuery) membershipsQuery = candidateQuery;
            if (snapshot && !snapshot.empty) {
              membershipsQuery = candidateQuery;
              break;
            }
          }
          if (membershipAccessDenied || membershipsQuery) break;
        }

        if (membershipAccessDenied) {
          console.warn('[ProfilePickerPage] Membership access denied in Firestore');
          setIsInitialSnapshotLoaded(true);
          hydrateTeamsFromFetcher();
          return;
        }

        if (!membershipsQuery) {
          console.warn('[ProfilePickerPage] No valid membership query candidate found.');
          setIsInitialSnapshotLoaded(true);
          hydrateTeamsFromFetcher();
          return;
        }

        console.log('[ProfilePickerPage] Starting onSnapshot for membershipsQuery');
        let latestSnapshotId = 0;

        const handleSnapshot = (snapshot) => {
          console.log('[ProfilePickerPage] Received memberships snapshot, empty:', snapshot.empty, 'size:', snapshot.size);
          setIsInitialSnapshotLoaded(true);
          setIsInitialSyncComplete(true);
          setLoading(false);

          latestSnapshotId += 1;
          const currentSnapshotId = latestSnapshotId;

          const extractMembershipEntries = (snap) =>
            snap.docs
              .map((docSnap) => {
                const teamRef = docSnap?.ref?.parent?.parent || null;
                let teamId = teamRef?.id || null;
                if (!teamId) {
                  try {
                    const data = typeof docSnap.data === 'function' ? docSnap.data() : {};
                    teamId = data?.team_id || data?.teamId || null;
                  } catch { teamId = null; }
                }
                return teamId ? { teamId, teamRef: teamRef || doc(db, 'teams', teamId) } : null;
              })
              .filter(Boolean);

          const processSnapshot = async () => {
            const membershipEntries = extractMembershipEntries(snapshot);
            if (membershipEntries.length === 0) {
              console.log('[ProfilePickerPage] No memberships found in snapshot, hydrating from fetcher...');
              hydrateTeamsFromFetcher();
              return;
            }

            const uniqueTeamRefs = new Map();
            membershipEntries.forEach(({ teamId, teamRef }) => {
              if (!uniqueTeamRefs.has(teamId)) uniqueTeamRefs.set(teamId, teamRef);
            });

            const teamIds = Array.from(uniqueTeamRefs.keys());
            let resolvedTeams = [];
            try {
              const batchSize = 30;
              for (let i = 0; i < teamIds.length; i += batchSize) {
                const chunk = teamIds.slice(i, i + batchSize);
                const q = query(collection(db, 'teams'), where(documentId(), 'in', chunk));
                const querySnap = await getDocs(q);
                resolvedTeams = [...resolvedTeams, ...querySnap.docs];
              }
            } catch (batchError) {
              console.warn('[ProfilePickerPage] Batch team fetch failed, sequential fallback');
              resolvedTeams = await Promise.all(
                Array.from(uniqueTeamRefs.entries()).map(async ([tId, tRef]) => {
                  try { return await getDoc(tRef); } catch { return null; }
                })
              );
            }

            if (!active || currentSnapshotId !== latestSnapshotId) return;

            const nextTeams = resolvedTeams
              .map((snap) => snap && normalizeTeamDoc(snap))
              .filter(Boolean)
              .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

            console.log('[ProfilePickerPage] Setting teams from snapshot:', nextTeams.length);
            setTeams(nextTeams);
            setLoading(false);
            setError('');
            writeTeamsCache(nextTeams);
          };

          processSnapshot().catch((err) => {
            console.error('[ProfilePickerPage] Hydration Error:', err);
            hydrateTeamsFromFetcher();
          });
        };

        unsubscribeTeams = onSnapshot(
          membershipsQuery,
          (snapshot) => { if (active) handleSnapshot(snapshot); },
          (err) => {
            console.error('[ProfilePickerPage] onSnapshot Error:', err);
            setIsInitialSnapshotLoaded(true);
            hydrateTeamsFromFetcher();
          }
        );
      } catch (err) {
        console.error('[ProfilePickerPage] Subscription Exception:', err);
        setIsInitialSnapshotLoaded(true);
        hydrateTeamsFromFetcher();
      }
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (active) subscribeToTeams(user);
    });

    if (auth.currentUser) {
      subscribeToTeams(auth.currentUser);
    }

    return () => {
      active = false;
      stopTeamsListener();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [fetchTeamsList, navigate]);

  useEffect(() => {
    let active = true;
    let lastFetchedUid = null;

    const ensureInitialTeams = (user) => {
      if (!user?.uid || lastFetchedUid === user.uid) return;
      lastFetchedUid = user.uid;
      const cached = readTeamsCache();
      const hasCache = Array.isArray(cached) && cached.length > 0;
      fetchTeamsList({
        skipStartLoading: hasCache,
        silent: hasCache,
        shouldUpdate: () => active,
      });
    };

    if (auth.currentUser) ensureInitialTeams(auth.currentUser);
    const stopAuth = auth.onAuthStateChanged((user) => {
      if (active) ensureInitialTeams(user);
    });

    return () => {
      active = false;
      stopAuth();
    };
  }, [fetchTeamsList]);

  const updateLastContext = useCallback(async (contextData) => {
    try {
      if (!auth.currentUser) return;
      setContextError('');
      await apiFetch('/auth/context', {
        method: 'PUT',
        body: JSON.stringify(contextData),
      });
    } catch (err) {
      console.error('[ProfilePickerPage] Context Update Error:', err);
      setContextError('Erreur de mise à jour du contexte.');
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
    if (!teamId || !user?.uid) return;
    try {
      await apiFetch(`/teams/${teamId}/memberships/ensure`, {
        method: 'POST',
        body: JSON.stringify({ include_joined_at: options.includeJoinedAt === true }),
      });
    } catch (err) {
      console.error('[ProfilePickerPage] Ensure Membership Error:', err);
    }
  };

  const handleSelectTeam = (team) => {
    const user = auth.currentUser;
    if (team?.team_id && user?.uid) ensureMembershipForUser(team.team_id, user);
    const context = { type: 'team', teamId: team.team_id, teamName: team.name };
    contextStore.set(context);
    localStorage.setItem('teamId', team.team_id);
    localStorage.setItem('teamName', team.name);
    navigate(`/team/${team.team_id}`);
    updateLastContext({ type: 'team', team_id: team.team_id });
  };

  const handleDeleteTeam = useCallback(async (team) => {
    if (!team?.team_id || !window.confirm(`Supprimer "${team.name}" ?`)) return;
    try {
      setError('');
      setDeletingTeamId(team.team_id);
      await apiFetch(`/teams/${team.team_id}`, { method: 'DELETE' });
      showToast(`Équipe "${team.name}" supprimée`);
      removeTeamFromCache(team.team_id);
      setTeams(prev => prev.filter(t => t.team_id !== team.team_id));
      const ctx = contextStore.get();
      if (ctx?.teamId === team.team_id) {
        localStorage.removeItem('teamId');
        localStorage.removeItem('teamName');
        const solo = { type: 'solo' };
        contextStore.set(solo);
        updateLastContext(solo);
      }
    } catch (err) {
      console.error('[ProfilePickerPage] Delete Error:', err);
      setError(err?.message || "Erreur lors de la suppression");
    } finally {
      setDeletingTeamId(null);
    }
  }, [updateLastContext]);

  const handleCreateTeam = async (name) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');
      const data = await apiFetch('/teams', { method: 'POST', body: JSON.stringify({ name }) });
      if (!data?.success) throw new Error(data?.error || 'Erreur création');
      await ensureMembershipForUser(data.team_id, user, { includeJoinedAt: true });
      const newTeam = { team_id: data.team_id, name: data.name || name, owner_uid: user.uid, members_count: 1 };
      clearTeamsCache();
      setTeams(prev => prev.some(t => t.team_id === newTeam.team_id) ? prev : [...prev, newTeam]);
      setInviteDialogTeam(newTeam);
    } catch (err) { throw err; }
  };

  const handleJoinTeam = async (code) => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Non connecté');
      const data = await apiFetch('/teams/join', { method: 'POST', body: JSON.stringify({ code }) });
      if (!data?.success) throw new Error(data?.error || 'Code invalide');
      await ensureMembershipForUser(data.team_id, user, { includeJoinedAt: !data.already_member });
      clearTeamsCache();
      handleSelectTeam({ team_id: data.team_id, name: data.name });
    } catch (err) { throw err; }
  };

  const isActuallyLoading = loading && teams.length === 0;
  const shouldShowEmptyState = !loading && teams.length === 0 && !error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
          Qui est-ce ?
        </h1>
        <p className="text-gray-300 text-lg">Choisissez votre contexte de travail</p>
      </div>

      {error && <div className="mb-6 p-4 rounded-lg max-w-md border bg-red-500/20 border-red-500 text-red-200">{error}</div>}
      {contextError && <div className="mb-6 p-4 bg-amber-500/20 border border-amber-400 rounded-lg text-amber-100 max-w-md">{contextError}</div>}

      {isActuallyLoading && !error && (
        <div className="mb-8 flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <span className="h-2 w-2 animate-ping rounded-full bg-white/70" aria-hidden />
          <span>Chargement des profils…</span>
        </div>
      )}

      {shouldShowEmptyState && (
        <div className="mb-8 max-w-md text-center p-6 bg-white/10 border border-white/20 rounded-xl backdrop-blur-sm">
          <h3 className="text-xl font-semibold text-white mb-2">Aucune équipe trouvée</h3>
          <p className="text-gray-300 mb-4">{FRIENDLY_EMPTY_STATE_MESSAGE}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-5xl w-full mb-8">
        <button onClick={handleSelectSolo} className="group relative aspect-square bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-2xl overflow-hidden hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105 min-h-[160px]">
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 mb-3 bg-white/20 rounded-full flex items-center justify-center"><User size={32} className="text-white" /></div>
            <span className="text-white font-semibold text-lg">Moi</span>
            <span className="text-white/80 text-sm mt-1">Solo</span>
          </div>
        </button>

        {teams.map((team) => {
          const isOwner = auth.currentUser?.uid && team.owner_uid === auth.currentUser.uid;
          return (
            <button key={team.team_id} onClick={() => handleSelectTeam(team)} className="group relative aspect-square bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-2xl overflow-hidden hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105 min-h-[160px]">
              <span className="absolute top-3 left-3 z-10 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">Équipe</span>
              {isOwner && (
                <>
                  <Share2 size={18} className="absolute top-3 right-3 text-white/50 hover:text-white" onClick={(e) => { e.stopPropagation(); setInviteDialogTeam(team); }} />
                  <Trash2 size={18} className="absolute bottom-3 right-3 text-white/50 hover:text-red-400" onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team); }} />
                </>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 mb-3 bg-white/20 rounded-full flex items-center justify-center"><Users size={32} className="text-white" /></div>
                <span className="text-white font-semibold text-center text-sm line-clamp-2">{team.name}</span>
                <span className="text-white/80 text-xs mt-1">{team.members_count} membre{team.members_count > 1 ? 's' : ''}</span>
              </div>
            </button>
          );
        })}

        <button onClick={() => setShowCreateDialog(true)} className="group relative aspect-square bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-2xl overflow-hidden hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105 min-h-[160px]">
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 mb-3 bg-white/10 rounded-full flex items-center justify-center"><Plus size={32} className="text-white" /></div>
            <span className="text-white font-semibold text-sm">Créer une équipe</span>
          </div>
        </button>

        <button onClick={() => setShowJoinDialog(true)} className="group relative aspect-square bg-white/10 backdrop-blur-sm border-2 border-white/30 rounded-2xl overflow-hidden hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105 min-h-[160px]">
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 mb-3 bg-white/10 rounded-full flex items-center justify-center"><LogIn size={32} className="text-white" /></div>
            <span className="text-white font-semibold text-sm">Rejoindre une équipe</span>
          </div>
        </button>
      </div>

      <CreateTeamDialog isOpen={showCreateDialog} onClose={() => setShowCreateDialog(false)} onCreateTeam={handleCreateTeam} />
      <JoinTeamDialog isOpen={showJoinDialog} onClose={() => setShowJoinDialog(false)} onJoinTeam={handleJoinTeam} />
      <TeamInviteCodeDialog isOpen={Boolean(inviteDialogTeam)} team={inviteDialogTeam} onClose={() => setInviteDialogTeam(null)} onOpenTeam={handleSelectTeam} />

      <div className="mt-8 text-center"><p className="text-gray-400 text-sm">Vous pouvez changer de contexte à tout moment depuis le planning</p></div>
    </div>
  );
};

export default ProfilePickerPage;
