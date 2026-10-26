import { cn } from 'cn';
import { Loader2Icon } from 'lucide-react';
import type * as React from 'react';

const Spinner = ({ className, ...props }: React.ComponentProps<'svg'>) => {
  return (
    <Loader2Icon
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      data-slot="spinner"
      role="status"
      {...props}
    />
  );
};

export { Spinner };
