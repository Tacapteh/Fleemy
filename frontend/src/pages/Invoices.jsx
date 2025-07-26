import { Invoices as LegacyInvoices } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Invoices() {
  const { user, sessionToken } = useOutletContext();
  return <LegacyInvoices user={user} sessionToken={sessionToken} />;
}
