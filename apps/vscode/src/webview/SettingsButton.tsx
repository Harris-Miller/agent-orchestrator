import { IconTooltipButton, UpdatesIndicator } from '@lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import type { FC } from 'react';

export const SettingsButton: FC = () => {
  const navigate = useNavigate();
  return (
    <>
      <UpdatesIndicator
        onOpenProviders={() => {
          navigate({ params: { category: 'providers' }, to: '/settings/$category' }).catch(() => undefined);
        }}
      />
      <IconTooltipButton
        icon={Settings}
        label="Settings"
        onClick={() => {
          navigate({ to: '/settings' }).catch(() => undefined);
        }}
      />
    </>
  );
};
