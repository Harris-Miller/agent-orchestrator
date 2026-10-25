import { cn } from 'cn';
import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, FC } from 'react';

/** Pill chip used by composer / handoff Config chrome. */
export const ComposerChromeChip: FC<
  {
    readonly interactive?: boolean;
  } & ComponentProps<'button'>
> = ({ children, className, disabled = false, interactive = true, type: _type = 'button', ...props }) => {
  const classes = cn(
    'inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-2 py-1 text-[13px] text-muted-foreground',
    'data-popup-open:bg-accent',
    disabled ? 'cursor-default opacity-50' : interactive ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
    className,
  );

  if (!interactive) {
    return (
      <span aria-disabled={disabled || undefined} className={classes}>
        {children}
      </span>
    );
  }

  return (
    <button {...props} className={classes} disabled={disabled} type="button">
      {children}
      <ChevronDownIcon className="size-4 opacity-70" />
    </button>
  );
};
