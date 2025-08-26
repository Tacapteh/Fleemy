import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function useTeam(teamId) {
  const [state, setState] = useState({ data: null, error: null });
  const [loading, setLoading] = useState(true);
  const resolvedTeamId = teamId ?? localStorage.getItem('teamId');

  useEffect(() => {
    const loadTeam = async () => {
      if (!auth.currentUser || !resolvedTeamId) {
        setState({ data: null, error: null });
        setLoading(false);
        return;
      }
      try {
        const teamPath = `teams/${resolvedTeamId}`;
        console.log(`Reading path: ${teamPath}`);
        const teamSnap = await getDoc(doc(db, teamPath));
        if (!teamSnap.exists()) {
          setState({ data: null, error: null });
          setLoading(false);
          return;
        }
        const data = teamSnap.data();
        const members = (data.members || []).map((uid) => {
          if (uid === auth.currentUser.uid && auth.currentUser.displayName) {
            return { uid, name: auth.currentUser.displayName };
          }
          return { uid };
        });
        setState({
          data: { id: resolvedTeamId, name: data.name, ownerId: data.ownerId, members },
          error: null,
        });
      } catch (e) {
        if (e.message?.includes('Missing or insufficient permissions')) {
          setState({ error: 'no-access', data: null });
        } else {
          console.error('useTeam error', e);
          setState({ data: null, error: e.message || 'unknown' });
        }
      }
      setLoading(false);
    };

    loadTeam();
  }, [resolvedTeamId]);

  return { team: state.data, error: state.error, loading };
}
