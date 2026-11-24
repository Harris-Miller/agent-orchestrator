/** PROTOTYPE (#457, throwaway): the indicator next to the Settings gear; renders whichever variant the bottom bar picked. */
import { useNavigate } from '@tanstack/react-router';
import type { FC } from 'react';

import { useProtoState } from './store.ts';
import { VariantA } from './VariantA.tsx';
import { VariantB } from './VariantB.tsx';
import { VariantC } from './VariantC.tsx';

/** `compact` = the 52px vertical rail (no room for a labelled pill). */
export const UpdatesIndicator: FC<{ readonly compact: boolean }> = ({ compact }) => {
  const { items, scenario, variant } = useProtoState();
  const navigate = useNavigate();
  const onOpenProviders = () => {
    navigate({ params: { category: 'providers' }, to: '/settings/$category' }).catch(() => undefined);
  };
  if (!import.meta.env.DEV) return null;
  switch (variant) {
    case 'A':
      return <VariantA checkFailed={scenario === 'check-failed'} items={items} onOpenProviders={onOpenProviders} />;
    case 'B':
      return (
        <VariantB
          checkFailed={scenario === 'check-failed'}
          compact={compact}
          items={items}
          onOpenProviders={onOpenProviders}
        />
      );
    case 'C':
      return <VariantC checkFailed={scenario === 'check-failed'} items={items} onOpenProviders={onOpenProviders} />;
  }
};
