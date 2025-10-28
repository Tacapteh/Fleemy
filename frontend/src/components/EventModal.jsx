import React from 'react';
import { useNavigate } from 'react-router-dom';
import { EventModal as LegacyEventModal } from '../LegacyApp';

export default function EventModal(props) {
  const navigate = useNavigate();
  return <LegacyEventModal {...props} navigate={navigate} />;
}
