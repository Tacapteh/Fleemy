import WeeklyTaskForm from './WeeklyTaskForm';

export default function WeeklyTaskModal({ isOpen, task, onSave, onDelete, onClose }) {
  if (!isOpen) return null;

  const handleSave = (savedTask) => {
    if (onSave) {
      onSave(savedTask);
    }
  };

  return (
    <WeeklyTaskForm
      initialTask={task}
      onSave={handleSave}
      onCancel={onClose}
      onDelete={onDelete}
    />
  );
}