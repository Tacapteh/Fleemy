import WeeklyTaskForm from './WeeklyTaskForm';

export default function WeeklyTaskModal({
  isOpen,
  task,
  onSave,
  onDelete,
  onClose,
  context,
  readOnly,
  weekStartISO,
  onSwitchToEvent,
}) {
  if (!isOpen) return null;

  const handleSave = (savedTask) => {
    if (onSave) {
      onSave(savedTask);
    }
  };

  return (
    <WeeklyTaskForm
      initialTask={task}
      context={context}
      readOnly={readOnly}
      weekStartISO={weekStartISO}
      onSave={handleSave}
      onCancel={onClose}
      onDelete={onDelete}
      onSwitchToEvent={onSwitchToEvent}
    />
  );
}
