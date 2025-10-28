import React from 'react';

export function ReceiptIcon({ className = '', ...props }) {
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
      <path d="M8.25 3.75h7.5A2.25 2.25 0 0 1 18 6v13.5l-2.25-1.35-2.25 1.35-2.25-1.35-2.25 1.35-2.25-1.35L4.5 19.5V6A2.25 2.25 0 0 1 6.75 3.75z" />
      <path d="M9.75 9.75h6" />
      <path d="M9.75 12.75h6" />
      <path d="M9.75 15.75h3.75" />
    </svg>
  );
}
