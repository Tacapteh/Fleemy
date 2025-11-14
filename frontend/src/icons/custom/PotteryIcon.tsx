import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

export const PotteryIcon: LucideIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ strokeWidth = 1.8, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={strokeWidth as number}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M9 3h6" />
      <path d="M9 3c0 3-2 4-2 6 0 2 1 5 5 5s5-3 5-5c0-2-2-3-2-6" />
      <path d="M8 14c0 3-2 5-2 6h12c0-1-2-3-2-6" />
    </svg>
  )
);

PotteryIcon.displayName = 'PotteryIcon';
