import { Invoices as LegacyInvoices } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Invoices() {
  const { user } = useOutletContext();
  return <LegacyInvoices user={user} />;
}
