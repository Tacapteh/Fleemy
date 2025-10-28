import React from 'react';

export function CalendarIcon({ className = '', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect x={4.5} y={5.25} width={15} height={14.25} rx={2} />
      <path d="M8.25 3.75v3" />
      <path d="M15.75 3.75v3" />
      <path d="M4.5 9.75h15" />
    </svg>
  );
}
