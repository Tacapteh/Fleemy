import { useOutletContext } from 'react-router-dom';
import QuotesContent from '../components/documents/QuotesContent';

export default function Quotes() {
  const { user } = useOutletContext();
  return <QuotesContent user={user} />;
}
