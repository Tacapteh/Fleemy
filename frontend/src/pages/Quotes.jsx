import { Quotes as LegacyQuotes } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Quotes() {
  const { user, sessionToken } = useOutletContext();
  return <LegacyQuotes user={user} sessionToken={sessionToken} />;
}
