import { Quotes as LegacyQuotes } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Quotes() {
  const { user } = useOutletContext();
  return <LegacyQuotes user={user} />;
}
