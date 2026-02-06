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

// 🚨 EMERGENCY CIRCUIT BREAKER - Prevent quota exhaustion
const FIRESTORE_REQUEST_LIMIT = 100; // Max 100 requests per session
let firestoreRequestCount = 0;
let circuitBreakerTripped = false;

function checkFirestoreQuota(operation = 'unknown') {
  if (circuitBreakerTripped) {
    console.error('[CIRCUIT BREAKER] Firestore requests blocked to prevent quota exhaustion');
    return false;
  }

  firestoreRequestCount++;
  console.log(`[Firestore] Request #${firestoreRequestCount} (${operation})`);

  if (firestoreRequestCount >= FIRESTORE_REQUEST_LIMIT) {
    circuitBreakerTripped = true;
    console.error('[CIRCUIT BREAKER] TRIPPED! Too many Firestore requests. Blocking further requests.');
    alert('⚠️ Trop de requêtes Firestore détectées. Rechargez la page si nécessaire.');
    return false;
  }

  return true;
}

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

  // Refs to break dependency cycles in fetchers
  const teamsRef = React.useRef(teams);
  const loadingRef = React.useRef(loading);
  const errorRef = React.useRef(error);
  const isInitialSnapshotLoadedRef = React.useRef(isInitialSnapshotLoaded);
  // Track if a fetch is currently running for the *current user* to avoid duplicates
  const fetchInProgressUidRef = React.useRef(null);
  // Track successful subscriptions to prevent infinite loops
  const subscribedUidRef = React.useRef(null);

  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { errorRef.current = error; }, [error]);
  useEffect(() => { isInitialSnapshotLoadedRef.current = isInitialSnapshotLoaded; }, [isInitialSnapshotLoaded]);

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
        shouldUpdate = () => true,
      } = options;

      // Ensure we don't start loading if we already have data and are just refreshing
      if (!skipStartLoading && teamsRef.current.length === 0) {
        setLoading(true);
      }
      setError('');

      console.log('[ProfilePickerPage] Starting stable parallel fetch...');

      try {
        // 1. Fire both requests safely
        // Note: ensureTeamsCache with forceRefresh might be slow, so we trust firestore first
        const apiPromise = ensureTeamsCache(() => apiFetch('/teams/my'))
          .then(result => ({ source: 'api', result }))
          .catch(err => ({ source: 'api', error: err }));

        const firestorePromise = fetchUserTeamsFromFirestore()
          .then(result => ({ source: 'firestore', result }))
          .catch(err => ({ source: 'firestore', error: err }));

        // 2. Wait for BOTH to finish. We do not race. We wait.
        // This ensures we have the complete picture before showing "No Teams".
        const results = await Promise.allSettled([apiPromise, firestorePromise]);

        if (!shouldUpdate()) return;

        // 3. Process results
        let apiTeams = [];
        let firestoreTeams = [];
        let apiError = null;

        results.forEach(res => {
          if (res.status === 'fulfilled') {
            const { source, result, error } = res.value;
            if (source === 'api') {
              if (result?.success !== false && Array.isArray(result?.teams)) {
                apiTeams = result.teams;
              } else if (Array.isArray(result)) { // handle raw array return
                apiTeams = result;
              } else if (error) {
                apiError = error;
              }
            } else if (source === 'firestore') {
              if (Array.isArray(result)) {
                firestoreTeams = result;
              }
            }
          }
        });

        console.log(`[ProfilePickerPage] Fetched: API=${apiTeams.length}, Firestore=${firestoreTeams.length}`);

        // 4. Merge Strategies
        // We prefer API data (it has more details), but Firestore is the backup.
        // We deduplicate by ID.
        const mergedMap = new Map();

        // Add Firestore teams first (base layer)
        firestoreTeams.forEach(t => {
          if (t.team_id) mergedMap.set(t.team_id, t);
        });

        // Overlay API teams (top layer, authoritative for details)
        apiTeams.forEach(t => {
          if (t.team_id) {
            // If we have existing firestore data, we might merge properties, but usually API is fuller.
            // However, API might miss locally created teams not yet synced? Unlikely.
            mergedMap.set(t.team_id, { ...mergedMap.get(t.team_id), ...t });
          }
        });

        const finalTeams = Array.from(mergedMap.values());

        // Normalize
        const mappedTeams = finalTeams
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

        if (mappedTeams.length > 0) {
          setTeams(mappedTeams);
          writeTeamsCache(mappedTeams); // Update cache
        } else if (apiError && firestoreTeams.length === 0) {
          // Only show error if BOTH failed to give us data
          console.warn('[ProfilePickerPage] Both sources failed/empty', apiError);
          // If we have absolutely nothing, we might show the error, or just empty state.
          // Better to show empty state if just "no teams found" logic, but if API error...
          // Let's assume empty state is better than error for UX unless specific.
        } else {
          // Empty list, but valid (no teams found)
          setTeams([]);
        }

      } catch (err) {
        console.error('[ProfilePickerPage] Critical fetch error', err);
      } finally {
        if (shouldUpdate()) {
          setLoading(false);
          setIsInitialSyncComplete(true);
        }
      }
    },
    []
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
      // Do NOT reset subscribedUidRef here, because momentary null-auth (during token refresh) 
      // shouldn't clear our memory that we already fetched for this user.
      // We only clear it if we explicitly sign out or switch users.
    };

    const hydrateTeamsFromFetcher = () =>
      fetchTeamsList({
        skipStartLoading: true,
        silent: true,
        shouldUpdate: () => active,
      });

    const subscribeToTeams = async (user) => {
      console.log('[ProfilePickerPage] subscribeToTeams for UID:', user?.uid);

      if (!user) {
        console.warn('[ProfilePickerPage] No user authenticated, redirecting...');
        if (!active) return;
        setTeams([]);
        setLoading(false);
        setError('');
        setIsInitialSnapshotLoaded(true);
        subscribedUidRef.current = null; // Clear guard so we can re-sub later
        navigate('/');
        return;
      }

      // --- GUARDIAN OF THE GALAXY (AND QUOTA) ---
      // If we are already subscribed for THIS user, do NOT run again.
      if (subscribedUidRef.current === user.uid) {
        console.log('[ProfilePickerPage] Already subscribed for this UID, skipping redundant call.');
        return;
      }
      subscribedUidRef.current = user.uid;
      // ------------------------------------------

      stopTeamsListener();

      if (active) {
        // Prevent duplicate parallel fetches for the same user session if one is already flyin'
        // (Double check via fetchInProgressUidRef is also good)
        if (fetchInProgressUidRef.current === user.uid) {
          console.log('[ProfilePickerPage] Fetch already in progress/completed for this user.');
        } else {
          fetchInProgressUidRef.current = user.uid;
        }

        if (!hasCachedTeams) {
          setLoading(true);
        }
        setError('');
      }

      hydrateTeamsFromFetcher();

      // We rely on the API (hydrateTeamsFromFetcher) which handles caching and optimized server-side lookups.
      // The previous client-side Firestore logic (scanning collection groups) was redundant and caused quota usage issues.
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
    return () => {
      active = false;
      stopTeamsListener();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []); // Eslint ignore: fetchTeamsList is now stable or we ignore it to prevent loops

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
  const shouldShowEmptyState = !loading && teams.length === 0 && !error && isInitialSyncComplete;

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
            <div
              key={team.team_id}
              onClick={() => handleSelectTeam(team)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleSelectTeam(team);
                }
              }}
              className="group relative aspect-square bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-2xl overflow-hidden hover:bg-white/20 hover:border-white/50 transition-all hover:scale-105 min-h-[160px] cursor-pointer"
            >
              <span className="absolute top-3 left-3 z-10 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">
                Équipe
              </span>
              {isOwner && (
                <>
                  <Share2
                    size={18}
                    className="absolute top-3 right-3 text-white/50 hover:text-white z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInviteDialogTeam(team);
                    }}
                  />
                  <Trash2
                    size={18}
                    className="absolute bottom-3 right-3 text-white/50 hover:text-red-400 z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTeam(team);
                    }}
                  />
                </>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 mb-3 bg-white/20 rounded-full flex items-center justify-center">
                  <Users size={32} className="text-white" />
                </div>
                <span className="text-white font-semibold text-center text-sm line-clamp-2">
                  {team.name}
                </span>
                <span className="text-white/80 text-xs mt-1">
                  {team.members_count} membre{team.members_count > 1 ? 's' : ''}
                </span>
              </div>
            </div>
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
