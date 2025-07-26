import { Dashboard as LegacyDashboard } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Dashboard() {
  const { user, sessionToken } = useOutletContext();
  return <LegacyDashboard user={user} sessionToken={sessionToken} />;
}
