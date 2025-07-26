import { Planning as LegacyPlanning } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Planning() {
  const { user, sessionToken } = useOutletContext();
  return <LegacyPlanning user={user} sessionToken={sessionToken} />;
}
