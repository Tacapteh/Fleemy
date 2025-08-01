import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function useTeam() {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeAuth;
    const loadTeam = async (user) => {
      if (!user) {
        setTeam(null);
        setLoading(false);
        return;
      }
      try {
        const q = query(collection(db, 'teams'), where('members', 'array-contains', user.uid));
        const snap = await getDocs(q);
        if (snap.empty) {
          setTeam(null);
          setLoading(false);
          return;
        }
        const teamDoc = snap.docs[0];
        const data = teamDoc.data();
        const members = await Promise.all(
          data.members.map(async (uid) => {
            if (uid === user.uid && user.displayName) {
              return { uid, name: user.displayName };
            }
            try {
              const userSnap = await getDoc(doc(db, 'users', uid));
              const userData = userSnap.data();
              return { uid, name: userData?.name || uid };
            } catch (e) {
              return { uid };
            }
          })
        );
        setTeam({ id: teamDoc.id, name: data.name, ownerId: data.ownerId, members });
      } catch (e) {
        console.error('useTeam error', e);
        setTeam(null);
      }
      setLoading(false);
    };

    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      loadTeam(user);
    });
    return () => unsubscribeAuth && unsubscribeAuth();
  }, []);

  return { team, loading };
}
