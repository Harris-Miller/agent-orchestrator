import { cn } from 'cn';
import type { FC } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';

/** Label plus select. Base UI triggers are not native controls, so the label is aria-labelledby. */
export const LabeledSelect: FC<{
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly labelClassName?: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly { readonly label: string; readonly value: string }[];
  readonly triggerClassName?: string;
  readonly value: string;
}> = ({ disabled, id, label, labelClassName, onValueChange, options, triggerClassName, value }) => (
  <div className="flex min-w-36 flex-col gap-1">
    <span className={cn('text-xs text-muted-foreground', labelClassName)} id={`${id}-label`}>
      {label}
    </span>
    <Select
      disabled={disabled}
      onValueChange={next => {
        if (next !== null) {
          onValueChange(next);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-labelledby={`${id}-label`} className={triggerClassName} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value === '' ? 'empty-id' : option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
