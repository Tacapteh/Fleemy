import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { LucideIcon } from 'lucide-react';
import { getIcon } from '../icons/registry';

interface TaskIconBadgeProps {
  iconId?: string | null;
  label?: string | null;
  price?: number | null;
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

const TaskIconBadge: React.FC<TaskIconBadgeProps> = ({ iconId, label, price }) => {
  const IconComponent: LucideIcon = getIcon(iconId ?? undefined);
  const safeLabel = (label && label.trim()) || 'Tâche';
  const formattedPrice = formatPrice(price);
  const tooltipContent = formattedPrice ? `${safeLabel} — ${formattedPrice} €` : safeLabel;

  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <span
            className="inline-flex h-[18px] w-[18px] items-center justify-center pointer-events-auto align-middle"
            style={{ backgroundColor: 'transparent' }}
            aria-label={tooltipContent}
            title={tooltipContent}
            role="img"
          >
            <IconComponent className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          </span>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={4}
            className="z-50 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
          >
            {tooltipContent}
            <TooltipPrimitive.Arrow className="fill-neutral-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};

export default TaskIconBadge;

