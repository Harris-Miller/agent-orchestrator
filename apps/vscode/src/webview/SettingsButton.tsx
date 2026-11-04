import { IconTooltipButton } from '@lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import type { FC } from 'react';

export const SettingsButton: FC = () => {
  const navigate = useNavigate();
  return (
    <IconTooltipButton
      icon={Settings}
      label="Settings"
      onClick={() => {
        navigate({ to: '/settings' }).catch(() => undefined);
      }}
    />
  );
};
