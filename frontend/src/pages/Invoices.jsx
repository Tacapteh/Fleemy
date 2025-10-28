import { useOutletContext } from 'react-router-dom';
import InvoicesContent from '../components/documents/InvoicesContent';

export default function Invoices() {
  const { user } = useOutletContext();
  return <InvoicesContent user={user} />;
}
