/**
 * PROTOTYPE — variants of a combined Features (#185) + Missions (#28) surface, assuming #409 (the app tracks
 * only sessions it created), on the throwaway `/prototype/features` route, switchable via `?variant=`.
 * Model and fixtures: `components/prototype/featuresMissions/featuresMissionsFixtures.ts`.
 */
import { useClientErrorSnackbar } from '@lib/ui';
import Box from '@mui/material/Box';
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router';
import type { FC } from 'react';

import { usePrototypeContext } from '../../components/prototype/featuresMissions/featuresMissionsShared.tsx';
import { VariantARailTab } from '../../components/prototype/featuresMissions/VariantARailTab.tsx';
import { VariantCLanes } from '../../components/prototype/featuresMissions/VariantCLanes.tsx';
import {
  VariantDToggle,
  VariantESplit,
  VariantFSidePanel,
} from '../../components/prototype/featuresMissions/VariantsAPlusC.tsx';
import { PrototypeSwitcher } from '../../components/prototype/PrototypeSwitcher.tsx';

const VARIANT_LABELS = {
  A: 'Rail tab · chat primary',
  C: 'Lineage lanes by cwd',
  D: 'A+C · Chat | Lineage toggle',
  E: 'A+C · Lineage over chat',
  F: 'A+C · Lineage side panel',
} as const;
type Variant = keyof typeof VARIANT_LABELS;
const isVariant = (value: unknown): value is Variant => typeof value === 'string' && value in VARIANT_LABELS;

const routeApi = getRouteApi('/prototype/features');

const FeaturesPrototype: FC = () => {
  const { variant = 'A' } = routeApi.useSearch();
  const navigate = useNavigate({ from: '/prototype/features' });
  const { clientErrorSnackbar, onClientError } = useClientErrorSnackbar();
  const ctx = usePrototypeContext(onClientError);

  return (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      {variant === 'A' && <VariantARailTab ctx={ctx} />}
      {variant === 'C' && <VariantCLanes ctx={ctx} />}
      {variant === 'D' && <VariantDToggle ctx={ctx} />}
      {variant === 'E' && <VariantESplit ctx={ctx} />}
      {variant === 'F' && <VariantFSidePanel ctx={ctx} />}
      <PrototypeSwitcher
        current={variant}
        labels={VARIANT_LABELS}
        onChange={next => {
          navigate({ replace: true, search: { variant: isVariant(next) ? next : 'A' } }).catch(() => undefined);
        }}
        onExit={() => {
          navigate({ to: '/' }).catch(() => undefined);
        }}
      />
      {clientErrorSnackbar}
    </Box>
  );
};

export const Route = createFileRoute('/prototype/features')({
  component: FeaturesPrototype,
  validateSearch: (search: Record<string, unknown>): { variant?: Variant } =>
    isVariant(search.variant) ? { variant: search.variant } : {},
});
