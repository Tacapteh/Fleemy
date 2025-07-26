import { Clients as LegacyClients } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Clients() {
  const { user, sessionToken } = useOutletContext();
  return <LegacyClients user={user} sessionToken={sessionToken} />;
}
