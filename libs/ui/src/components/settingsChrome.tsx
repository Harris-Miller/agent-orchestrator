import { cn } from 'cn';
import { SearchIcon } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { Input } from './ui/input.tsx';

export const settingsCategoryRowClass = 'flex min-h-7 w-full items-center rounded-md px-2 py-0.5 text-left text-sm';

export const SettingsSearchField: FC<{
  readonly className?: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}> = ({ className, onValueChange, value }) => (
  <div className={cn('relative', className)}>
    <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      className="pl-8"
      onChange={event => {
        onValueChange(event.target.value);
      }}
      placeholder="Search settings…"
      value={value}
    />
  </div>
);

export const SettingsSectionIntro: FC<{ readonly children: ReactNode; readonly title: string }> = ({
  children,
  title,
}) => (
  <>
    <h2 className="text-lg font-medium">{title}</h2>
    <p className="mt-2 mb-4 text-sm text-muted-foreground">{children}</p>
  </>
);
