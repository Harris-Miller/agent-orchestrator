/**
 * PROTOTYPE host — three variants of the collapsible work region between user + agent.
 * Switch via `?variant=A|B|C` + floating bar. Throwaway; do not promote as-is.
 */
import type { FC, ReactNode } from 'react';

import { MCP_WORK_TURN } from './fixture.ts';
import { VariantA } from './VariantA.tsx';
import { VariantB } from './VariantB.tsx';
import { VariantC } from './VariantC.tsx';
import type { WorkRegionVariantKey } from './variants.ts';

export const PrototypeWorkRegionChat: FC<{
  readonly aboveComposer?: ReactNode;
  readonly variant: WorkRegionVariantKey;
}> = ({ aboveComposer, variant }) => {
  switch (variant) {
    case 'A':
      return <VariantA aboveComposer={aboveComposer} fixture={MCP_WORK_TURN} />;
    case 'B':
      return <VariantB aboveComposer={aboveComposer} fixture={MCP_WORK_TURN} />;
    case 'C':
      return <VariantC aboveComposer={aboveComposer} fixture={MCP_WORK_TURN} />;
  }
};
