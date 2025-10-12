import WeeklyTaskForm from './WeeklyTaskForm';

export default function WeeklyTaskModal({ isOpen, task, onSave, onDelete, onClose, context, readOnly }) {
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
      onSave={handleSave}
      onCancel={onClose}
      onDelete={onDelete}
    />
  );
}