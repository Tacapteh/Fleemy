import { auth } from '../firebase';

export async function getAuthHeaders(forceRefresh = false) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Utilisateur non authentifié');
  }

  try {
    const token = await currentUser.getIdToken(forceRefresh);
    return {
      Authorization: `Bearer ${token}`,
    };
  } catch (error) {
    if (!forceRefresh && auth.currentUser) {
      const refreshedToken = await auth.currentUser.getIdToken(true);
      return {
        Authorization: `Bearer ${refreshedToken}`,
      };
    }

    throw error;
  }
}

export default getAuthHeaders;
