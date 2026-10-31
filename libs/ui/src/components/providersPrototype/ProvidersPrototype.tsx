/**
 * PROTOTYPE (#175) — throwaway. Three variants of Settings → Providers + the startup Providers modal,
 * switchable via `?variant=A|B|C` (floating bar or ←/→). `?scenario=` picks the mock provider state.
 * All state is in-memory mock; no npm, no network, no User settings writes.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { useState } from 'react';
import type { FC } from 'react';

import { PrototypeSwitcher, useUrlSearchParam } from '../PrototypeSwitcher.tsx';
import type { PrototypeVariantEntry } from '../PrototypeSwitcher.tsx';

import { isScenarioId, overallStatus, SCENARIO_IDS, SCENARIOS } from './providersPrototype.model.ts';
import type { ScenarioId } from './providersPrototype.model.ts';
import { NodePrerequisiteDialog } from './providersPrototype.shared.tsx';
import { ProvidersProtoStoreProvider, useProvidersProto } from './providersPrototype.store.tsx';
import { VariantASettings, VariantAStartupModal } from './ProvidersVariantA.tsx';
import { VariantBSettings, VariantBStartupModal } from './ProvidersVariantB.tsx';
import { VariantCSettings, VariantCStartupModal } from './ProvidersVariantC.tsx';

const VARIANTS = {
  A: { Modal: VariantAStartupModal, Settings: VariantASettings, name: 'Master–detail' },
  B: { Modal: VariantBStartupModal, Settings: VariantBSettings, name: 'Stacked cards' },
  C: { Modal: VariantCStartupModal, Settings: VariantCSettings, name: 'Requirements matrix' },
} as const;

type VariantKey = keyof typeof VARIANTS;

const VARIANT_ENTRIES: readonly PrototypeVariantEntry[] = (Object.keys(VARIANTS) as VariantKey[]).map(key => ({
  key,
  name: VARIANTS[key].name,
}));

const isVariantKey = (value: string): value is VariantKey => Object.hasOwn(VARIANTS, value);

const barButtonSx = { color: 'inherit', fontSize: '0.75rem', minWidth: 0, textTransform: 'none' } as const;

/** Rule 5: surface the full mock state. */
const StateDump: FC = () => {
  const store = useProvidersProto();
  const rows = store.providers.map(p => ({
    auth: p.auth,
    cli: p.cli._tag,
    enabled: p.enabled,
    id: p.id,
    runtime:
      p.runtime === undefined
        ? '—'
        : `${p.runtime.job._tag}${p.runtime.active === undefined ? '' : ` active=${p.runtime.active}`} installed=[${p.runtime.installed.join(',')}] latest=${p.runtime.latest._tag}`,
    status: overallStatus(p),
  }));
  return (
    <Paper
      elevation={12}
      sx={{
        bgcolor: 'common.black',
        border: '1px solid',
        borderColor: 'warning.main',
        bottom: 64,
        color: 'common.white',
        fontFamily: 'monospace',
        fontSize: '0.7rem',
        left: '50%',
        maxWidth: '90vw',
        overflow: 'auto',
        p: 1.5,
        position: 'fixed',
        transform: 'translateX(-50%)',
        whiteSpace: 'pre',
        zIndex: theme => theme.zIndex.modal + 10,
      }}
    >
      {JSON.stringify({ seeded: store.seeded, showOnStartup: store.showOnStartup }, null, 0)}
      {'\n'}
      {rows
        .map(
          r =>
            `${r.id.padEnd(17)} ${(r.enabled ? 'on' : 'off').padEnd(4)} ${r.status.padEnd(14)} cli=${r.cli.padEnd(11)} auth=${r.auth.padEnd(11)} ${r.runtime}`,
        )
        .join('\n')}
    </Paper>
  );
};

const PrototypeBody: FC<{
  readonly onScenarioChange: (value: string) => void;
  readonly onVariantChange: (value: string) => void;
  readonly scenario: ScenarioId;
  readonly variantKey: VariantKey;
}> = ({ onScenarioChange, onVariantChange, scenario, variantKey }) => {
  const store = useProvidersProto();
  // First launch: bootstrap starts with the Node prerequisite check (mocked as failing).
  const [nodeOpen, setNodeOpen] = useState(() => !SCENARIOS[scenario].seeded);
  const [startupOpen, setStartupOpen] = useState(false);
  const [showState, setShowState] = useState(false);
  const { Modal, Settings } = VARIANTS[variantKey];

  return (
    <>
      <Box sx={{ pb: 8 }}>
        <Settings />
      </Box>
      <Modal
        onClose={() => {
          setStartupOpen(false);
        }}
        open={startupOpen}
      />
      <NodePrerequisiteDialog
        onResolved={() => {
          setNodeOpen(false);
          // Very first pass only: CLI detection seeds the toggles, then bootstrap step 2 (Providers modal).
          if (!store.seeded) {
            store.seedFirstRunDefaults();
            if (store.showOnStartup) {
              setStartupOpen(true);
            }
          }
        }}
        open={nodeOpen}
      />
      {showState ? <StateDump /> : null}
      <PrototypeSwitcher
        current={variantKey}
        extras={
          <>
            <Box
              component="select"
              onChange={event => {
                onScenarioChange(event.target.value);
              }}
              sx={{
                bgcolor: 'grey.900',
                border: 0,
                borderRadius: 1,
                color: 'inherit',
                fontSize: '0.75rem',
                px: 0.5,
                py: 0.25,
              }}
              value={scenario}
            >
              {SCENARIO_IDS.map(id => (
                <option key={id} value={id}>
                  Scenario: {SCENARIOS[id].label}
                </option>
              ))}
            </Box>
            <Button
              onClick={() => {
                setNodeOpen(false);
                setStartupOpen(open => !open);
              }}
              size="small"
              sx={barButtonSx}
            >
              Startup modal
            </Button>
            <Button
              onClick={() => {
                setStartupOpen(false);
                setNodeOpen(open => !open);
              }}
              size="small"
              sx={barButtonSx}
            >
              Node modal
            </Button>
            <Button
              onClick={() => {
                setShowState(open => !open);
              }}
              size="small"
              sx={barButtonSx}
            >
              {showState ? 'Hide state' : 'State'}
            </Button>
          </>
        }
        onChange={onVariantChange}
        variants={VARIANT_ENTRIES}
      />
    </>
  );
};

export const ProvidersPrototype: FC = () => {
  const [variantParam, setVariant] = useUrlSearchParam('variant', 'A');
  const [scenarioParam, setScenario] = useUrlSearchParam('scenario', 'fresh');
  const variantKey: VariantKey = isVariantKey(variantParam) ? variantParam : 'A';
  const scenario: ScenarioId = isScenarioId(scenarioParam) ? scenarioParam : 'fresh';

  // Keyed by scenario: switching scenario remounts store + bootstrap flow (simulates a fresh app launch).
  return (
    <ProvidersProtoStoreProvider key={scenario} scenario={scenario}>
      <PrototypeBody
        onScenarioChange={setScenario}
        onVariantChange={setVariant}
        scenario={scenario}
        variantKey={variantKey}
      />
    </ProvidersProtoStoreProvider>
  );
};
