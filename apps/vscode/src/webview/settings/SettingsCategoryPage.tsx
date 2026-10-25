import {
  Alert,
  AlertDescription,
  Button,
  isSettingsCategoryId,
  SettingsCategoryContent,
  settingsCategoryLabel,
} from '@lib/ui';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import { useEffect } from 'react';
import type { FC } from 'react';

/** VS Code Settings category detail (narrow sidebar). */
export const SettingsCategoryPage: FC = () => {
  const navigate = useNavigate();
  const { category: categoryParam } = useParams({ from: '/settings/$category' });
  const valid = isSettingsCategoryId(categoryParam);

  useEffect(() => {
    if (!valid) {
      navigate({ to: '/settings' }).catch(() => undefined);
    }
  }, [navigate, valid]);

  if (!valid) {
    return (
      <Alert>
        <AlertDescription>Unknown settings category.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-2">
      <div className="flex items-center gap-1">
        <Button
          aria-label="Back to Settings"
          onClick={() => {
            navigate({ to: '/settings' }).catch(() => undefined);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="min-w-0 flex-1 text-base font-semibold">{settingsCategoryLabel(categoryParam)}</h1>
      </div>
      <div className="min-w-0 px-3">
        <SettingsCategoryContent category={categoryParam} />
      </div>
    </div>
  );
};
