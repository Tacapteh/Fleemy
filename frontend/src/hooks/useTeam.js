import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

const buildMemberLabel = (memberData, currentUser) => {
  if (!memberData) return { uid: null };

  if (typeof memberData === "string") {
    return { uid: memberData };
  }

  const uid = memberData?.uid || null;
  const name = memberData?.name || memberData?.displayName || null;
  const email = memberData?.email || null;

  if (!uid) {
    return { uid: null };
  }

  if (currentUser && uid === currentUser.uid) {
    return {
      uid,
      name: name || currentUser.displayName || currentUser.email || null,
      email: email || currentUser.email || null,
    };
  }

  return {
    uid,
    name: name || null,
    email: email || null,
  };
};

export default function useTeam(teamId) {
  const [state, setState] = useState({ data: null, error: null });
  const [loading, setLoading] = useState(true);
  const resolvedTeamId = useMemo(() => {
    if (teamId) {
      return teamId;
    }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem("teamId");
      }
    } catch (storageError) {
      console.warn(
        "useTeam: unable to read teamId from localStorage",
        storageError
      );
    }
    return null;
  }, [teamId]);

  const [currentUser, setCurrentUser] = useState(() => auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const buildMembersList = useMemo(() => {
    return (rawMembers = []) => {
      const normalized = [];
      const seen = new Set();

      rawMembers.forEach((raw) => {
        const member = buildMemberLabel(raw, currentUser);
        if (!member?.uid || seen.has(member.uid)) {
          return;
        }
        seen.add(member.uid);
        normalized.push(member);
      });

      return normalized;
    };
  }, [currentUser]);

  useEffect(() => {
    const loadTeam = async () => {
      if (!currentUser || !resolvedTeamId) {
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

        const rawMembers = Array.isArray(data.members) ? data.members : [];
        const initialMembers = buildMembersList(rawMembers);

        const members = await Promise.all(
          initialMembers.map(async (member) => {
            if (!member?.uid) {
              return null;
            }

            if (member.name) {
              return member;
            }

            try {
              const userDoc = await getDoc(doc(db, "users", member.uid));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const inferredName =
                  userData?.name ||
                  userData?.displayName ||
                  userData?.full_name ||
                  userData?.fullName ||
                  null;

                const inferredEmail = userData?.email || null;

                return {
                  uid: member.uid,
                  name:
                    inferredName ||
                    (member.uid === currentUser?.uid
                      ? currentUser?.displayName || currentUser?.email || null
                      : null),
                  email: inferredEmail,
                };
              }
            } catch (memberError) {
              console.warn(
                "useTeam: impossible de charger le membre",
                member.uid,
                memberError
              );
            }

            if (member.uid === currentUser?.uid) {
              return {
                uid: member.uid,
                name: currentUser?.displayName || currentUser?.email || null,
                email: currentUser?.email || null,
              };
            }

            return member;
          })
        );

        const uniqueMembersMap = new Map();
        members.filter(Boolean).forEach((member) => {
          if (!member.uid) return;
          const existing = uniqueMembersMap.get(member.uid) || {};
          uniqueMembersMap.set(member.uid, {
            uid: member.uid,
            name: member.name || existing.name || null,
            email: member.email || existing.email || null,
          });
        });

        setState({
          data: {
            id: resolvedTeamId,
            name: data.name,
            ownerId: data.ownerId,
            members: Array.from(uniqueMembersMap.values()),
          },
          error: null,
        });
      } catch (e) {
        if (e.message?.includes("Missing or insufficient permissions")) {
          setState({ error: "no-access", data: null });
        } else {
          console.error("useTeam error", e);
          setState({ data: null, error: e.message || "unknown" });
        }
      }
      setLoading(false);
    };

    loadTeam();
  }, [resolvedTeamId, currentUser]);

  return { team: state.data, error: state.error, loading };
}
