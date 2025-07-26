import { Planning as LegacyPlanning } from '../LegacyApp';
import { useOutletContext } from 'react-router-dom';

export default function Planning() {
  const { user } = useOutletContext();
  return <LegacyPlanning user={user} />;
}
