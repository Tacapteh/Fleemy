import { Dashboard as LegacyDashboard } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useOutletContext();
  return <LegacyDashboard user={user} />;
}
