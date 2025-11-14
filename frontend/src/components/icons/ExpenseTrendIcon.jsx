import React from 'react';
import { TrendingDown } from 'lucide-react';

const ExpenseTrendIcon = ({ className = 'h-7 w-7', strokeWidth = 1.8, ...props }) => (
  <TrendingDown
    className={className}
    strokeWidth={strokeWidth}
    aria-hidden="true"
    focusable="false"
    {...props}
  />
);

export default ExpenseTrendIcon;
