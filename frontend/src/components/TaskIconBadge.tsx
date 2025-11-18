import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { LucideIcon } from 'lucide-react';
import { getIcon } from '../icons/registry';
import { getTaskColor } from '../constants/colors';
import { useSettings } from '../context/SettingsContext';
import { getPriorityDisplay } from '../utils/priorityDisplay';
import {
  TASK_STATUS_DISPLAY,
  TASK_STATUS_INDICATOR_STYLES,
  resolveEffectiveTaskStatus,
  type TaskStatusKey,
} from '../constants/taskStatusDisplay';

interface TaskIconBadgeProps {
  taskId: string;
  iconId?: string | null;
  label?: string | null;
  price?: number | null;
  colorKey?: string | null;
  onEdit?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  readOnly?: boolean;
  priority?: 'high' | 'medium' | 'low' | null;
  status?: 'todo' | 'doing' | 'done' | null;
  done?: boolean | null;
}

const formatPrice = (price?: number | null): string | undefined => {
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    return undefined;
  }
  return price.toLocaleString('fr-FR', {
    minimumFractionDigits: price % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

const TaskIconBadge: React.FC<TaskIconBadgeProps> = ({
  taskId,
  iconId,
  label,
  price,
  onEdit,
  onDelete,
  readOnly = false,
  colorKey,
  priority,
  status,
  done,
}) => {
  const IconComponent: LucideIcon = getIcon(iconId ?? undefined);
  const safeLabel = (label && label.trim()) || 'Tâche';
  const formattedPrice = formatPrice(price);
  const statusKey: TaskStatusKey = resolveEffectiveTaskStatus(status ?? undefined, done === true);
  const statusDisplay = TASK_STATUS_DISPLAY[statusKey];
  const statusIndicatorStyle = TASK_STATUS_INDICATOR_STYLES[statusKey];

  const { settings, showTaskStatusBadges } = useSettings();
  const showStatusBadges = showTaskStatusBadges !== false;

  const tooltipParts = [safeLabel];
  if (showStatusBadges && statusDisplay) {
    tooltipParts.push(statusDisplay.label);
  }
  if (formattedPrice) {
    tooltipParts.push(`${formattedPrice} €`);
  }
  const tooltipContent = tooltipParts.join(' — ');

  const showPriorityBadges = settings?.showTaskPriorityBadges !== false;

  const normalizedPriority = priority === 'high' || priority === 'medium' || priority === 'low'
    ? priority
    : undefined;

  const priorityDisplay = showPriorityBadges && normalizedPriority
    ? getPriorityDisplay(normalizedPriority)
    : null;

  const baseAriaLabel = formattedPrice
    ? `Ouvrir la tâche: ${safeLabel} — ${formattedPrice} €`
    : `Ouvrir la tâche: ${safeLabel}`;

  const ariaLabelParts = [baseAriaLabel];
  if (showStatusBadges && statusDisplay) {
    ariaLabelParts.push(statusDisplay.srLabel);
  }
  if (priorityDisplay) {
    ariaLabelParts.push(priorityDisplay.ariaLabel);
  }
  const ariaLabel = ariaLabelParts.join(' — ');

  const colorStyles = getTaskColor(colorKey);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const isDisabled = readOnly || typeof onEdit !== 'function';
  const canOpenMenu = !readOnly && (typeof onDelete === 'function' || typeof onEdit === 'function');

  const closeMenu = React.useCallback(() => {
    setMenuOpen(false);
    if (buttonRef.current) {
      buttonRef.current.focus();
    }
  }, []);

  const triggerEdit = React.useCallback(() => {
    if (isDisabled || typeof onEdit !== 'function') {
      return;
    }
    onEdit(taskId);
    closeMenu();
  }, [closeMenu, isDisabled, onEdit, taskId]);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      triggerEdit();
    },
    [triggerEdit]
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        triggerEdit();
        return;
      }

      if (
        (event.key === 'ContextMenu' || (event.shiftKey && event.key.toLowerCase() === 'f10')) &&
        canOpenMenu
      ) {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
      }
    },
    [triggerEdit, canOpenMenu]
  );

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canOpenMenu) {
        return;
      }
      setMenuOpen(true);
    },
    [canOpenMenu]
  );

  const handleEditSelect = React.useCallback(
    (event: Event) => {
      event.preventDefault();
      if ('stopPropagation' in event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      triggerEdit();
    },
    [triggerEdit]
  );

  const handleDeleteSelect = React.useCallback(
    (event: Event) => {
      event.preventDefault();
      if ('stopPropagation' in event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      if (readOnly || typeof onDelete !== 'function') {
        closeMenu();
        return;
      }
      onDelete(taskId);
      closeMenu();
    },
    [closeMenu, onDelete, readOnly, taskId]
  );

  const buttonClasses = [
    'relative inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[0]',
    'transition-opacity duration-150',
    isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-80',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <DropdownMenu.Root
          modal={false}
          open={menuOpen && !isDisabled}
          onOpenChange={(nextOpen) => {
            if (!canOpenMenu) {
              return;
            }
            setMenuOpen(nextOpen);
          }}
        >
          <DropdownMenu.Trigger
            asChild
            onPointerDown={(event) => {
              const isMousePointer =
                typeof event.pointerType === 'string'
                  ? event.pointerType === 'mouse'
                  : true;
              if (isMousePointer && event.button === 0) {
                event.preventDefault();
              }
            }}
          >
            <TooltipPrimitive.Trigger asChild>
              <button
                ref={buttonRef}
                type="button"
                className={buttonClasses}
                aria-label={ariaLabel}
                title={tooltipContent}
                disabled={isDisabled}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                onContextMenu={handleContextMenu}
                aria-haspopup={canOpenMenu ? 'menu' : undefined}
                aria-expanded={canOpenMenu ? menuOpen : undefined}
                style={{
                  backgroundColor: colorStyles.backgroundColor,
                  color: colorStyles.color,
                  borderColor: colorStyles.borderColor,
                }}
              >
                <IconComponent className="h-[14px] w-[14px]" strokeWidth={2.2} aria-hidden="true" />
                {showStatusBadges && statusDisplay ? (
                  <>
                    <span className="sr-only">{statusDisplay.srLabel}</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-1 left-1/2 h-1.5 w-3 -translate-x-1/2 rounded-full border"
                      style={{
                        backgroundColor: statusIndicatorStyle.backgroundColor,
                        borderColor: statusIndicatorStyle.borderColor,
                        boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.35)',
                      }}
                    />
                  </>
                ) : null}
                {priorityDisplay ? (
                  <span
                    className={`pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-white/70 ${priorityDisplay.bgClass}`}
                  >
                    {priorityDisplay.labelNumber}
                    <span className="sr-only">{priorityDisplay.ariaLabel}</span>
                  </span>
                ) : null}
              </button>
            </TooltipPrimitive.Trigger>
          </DropdownMenu.Trigger>

          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              sideOffset={4}
              className="z-50 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
            >
              {tooltipContent}
              <TooltipPrimitive.Arrow className="fill-neutral-900" />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>

          {canOpenMenu && (
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={4}
                align="end"
                className="z-50 min-w-[140px] rounded-md bg-white p-1 text-sm text-gray-800 shadow-lg ring-1 ring-black/5 focus:outline-none"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  if (buttonRef.current) {
                    buttonRef.current.focus();
                  }
                }}
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-sm text-gray-700 outline-none focus:bg-blue-50 focus:text-blue-700"
                  onSelect={handleEditSelect}
                >
                  Modifier
                </DropdownMenu.Item>
                {typeof onDelete === 'function' && !readOnly && (
                  <DropdownMenu.Item
                    className="flex cursor-pointer select-none items-center rounded px-2 py-1.5 text-sm text-red-600 outline-none focus:bg-red-50"
                    onSelect={handleDeleteSelect}
                  >
                    Supprimer
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          )}
        </DropdownMenu.Root>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};

export default TaskIconBadge;
