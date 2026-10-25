import { cn } from 'cn';
import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

type StaticChipProps = {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly interactive: false;
};

type ButtonChipProps = { readonly interactive?: true } & ComponentProps<'button'>;

const chipClass = (disabled: boolean, interactive: boolean, className?: string): string =>
  cn(
    'inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-2 py-1 text-[13px] text-muted-foreground',
    'data-popup-open:bg-accent',
    disabled ? 'cursor-default opacity-50' : interactive ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
    className,
  );

/** Pill chip used by composer / handoff Config chrome. */
export const ComposerChromeChip = (props: ButtonChipProps | StaticChipProps) => {
  if (props.interactive === false) {
    return (
      <span
        aria-disabled={props.disabled === true ? true : undefined}
        className={chipClass(props.disabled === true, false, props.className)}
      >
        {props.children}
      </span>
    );
  }

  const { children, className, disabled = false, interactive: _interactive, type: _type, ...buttonProps } = props;
  return (
    <button {...buttonProps} className={chipClass(disabled, true, className)} disabled={disabled} type="button">
      {children}
      <ChevronDownIcon className="size-4 opacity-70" />
    </button>
  );
};
