import React from 'react';

export function PhoneIcon({ className = '', ...props }) {
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
      <path d="M7.5 4.5h-1.5a2.25 2.25 0 0 0-2.25 2.46 15.75 15.75 0 0 0 13.29 13.29 2.25 2.25 0 0 0 2.46-2.25v-1.5a1.5 1.5 0 0 0-1.35-1.5l-3.36-.48a1.5 1.5 0 0 0-1.26.42l-1.23 1.23a11.25 11.25 0 0 1-5.25-5.25l1.23-1.23a1.5 1.5 0 0 0 .42-1.26l-.48-3.36A1.5 1.5 0 0 0 7.5 4.5z" />
    </svg>
  );
}
