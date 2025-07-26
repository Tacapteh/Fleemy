import { Clients as LegacyClients } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Clients() {
  const { user } = useOutletContext();
  return <LegacyClients user={user} />;
}
