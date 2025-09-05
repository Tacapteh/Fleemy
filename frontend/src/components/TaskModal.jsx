import TaskForm from './TaskForm';

export default function TaskModal({ isOpen, task, onSave, onDelete, onClose }) {
  if (!isOpen) return null;
  return (
    <TaskForm
      initialTask={task}
      onSave={onSave}
      onCancel={onClose}
      onDelete={onDelete}
    />
  );
}
