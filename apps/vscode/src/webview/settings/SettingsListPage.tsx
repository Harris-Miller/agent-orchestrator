import {
  Button,
  filterSettingsCategories,
  Input,
  RestoreUserSettingsDefaultsControl,
  UserSettingsLoadFailureAlert,
} from '@lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

/** VS Code Settings category list (narrow sidebar). */
export const SettingsListPage: FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => filterSettingsCategories(query), [query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <Button
          aria-label="Back to Session History"
          onClick={() => {
            navigate({ to: '/' }).catch(() => undefined);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="min-w-0 flex-1 text-base font-semibold">Settings</h1>
        <RestoreUserSettingsDefaultsControl />
      </div>

      <UserSettingsLoadFailureAlert />

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          onChange={event => {
            setQuery(event.target.value);
          }}
          placeholder="Search settings…"
          value={query}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filteredItems.map(item => (
          <button
            className="flex min-h-7 w-full items-center rounded-md px-2 py-0.5 text-left text-sm hover:bg-muted"
            key={item.id}
            onClick={() => {
              navigate({ params: { category: item.id }, to: '/settings/$category' }).catch(() => undefined);
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};
