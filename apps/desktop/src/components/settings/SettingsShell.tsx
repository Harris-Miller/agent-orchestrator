import {
  Button,
  filterSettingsCategories,
  Input,
  isSettingsCategoryId,
  RestoreUserSettingsDefaultsControl,
  settingsCategoryLabel,
  UserSettingsLoadFailureAlert,
} from '@lib/ui';
import { Outlet, useMatch, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

const BackToApp: FC = () => {
  const navigate = useNavigate();
  return (
    <Button
      className="justify-start"
      onClick={() => {
        navigate({ to: '/' }).catch(() => undefined);
      }}
      variant="ghost"
    >
      <ArrowLeftIcon />
      Back to app
    </Button>
  );
};

/** Desktop Settings shell: category rail + route-driven `$category` outlet. */
export const SettingsShell: FC = () => {
  const navigate = useNavigate();
  const categoryMatch = useMatch({ from: '/settings/$category', shouldThrow: false });
  const categoryParam = categoryMatch?.params.category;
  const category = categoryParam !== undefined && isSettingsCategoryId(categoryParam) ? categoryParam : undefined;

  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => filterSettingsCategories(query), [query]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="flex w-[260px] flex-col border-r border-border bg-card">
        <div className="shrink-0 p-3">
          <BackToApp />
          <div className="relative mt-2">
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
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
          {filteredItems.map(item => (
            <button
              className={
                category === item.id
                  ? 'flex min-h-7 w-full items-center rounded-md bg-accent px-2 py-0.5 text-left text-sm'
                  : 'flex min-h-7 w-full items-center rounded-md px-2 py-0.5 text-left text-sm hover:bg-muted'
              }
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

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="min-w-0 flex-1 text-2xl font-medium">
              {category !== undefined ? settingsCategoryLabel(category) : 'Settings'}
            </h1>
            <RestoreUserSettingsDefaultsControl />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <UserSettingsLoadFailureAlert className="mb-4" />
          <div className="rounded-lg border border-border p-6">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};
