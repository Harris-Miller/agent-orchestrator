/**
 * PROTOTYPE (#175) — Variant B: stacked cards (Orca-style accordion).
 * Each provider is a card: summary row with status chip + primary action; expanding shows the
 * dependency chain as numbered steps (CLI → Runtime → Sign-in) and a version picker.
 * Startup modal reuses the same card; providers needing attention open by default.
 */
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { Check, ChevronDown, Circle, X } from 'lucide-react';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { overallStatus, PROVIDER_META, runtimeDir, STATUS_META } from './providersPrototype.model.ts';
import type { ProviderMock, StatusTone } from './providersPrototype.model.ts';
import {
  InstallProgress,
  ProviderEnabledSwitch,
  ProviderHelp,
  ProviderPrimaryAction,
  ProvidersStartupDialog,
  useCheckedLabel,
} from './providersPrototype.shared.tsx';
import { useProvidersProto } from './providersPrototype.store.tsx';

const chipColor = (tone: StatusTone): 'default' | 'error' | 'info' | 'success' | 'warning' =>
  tone === 'neutral' ? 'default' : tone;

type StepState = 'blocked' | 'busy' | 'done' | 'todo';

const StepIcon: FC<{ readonly index: number; readonly state: StepState }> = ({ index, state }) => {
  const common = {
    alignItems: 'center',
    borderRadius: '50%',
    display: 'flex',
    flexShrink: 0,
    height: 24,
    justifyContent: 'center',
    width: 24,
  } as const;
  switch (state) {
    case 'done':
      return (
        <Box sx={{ ...common, bgcolor: 'success.main', color: 'success.contrastText' }}>
          <LucideMuiIcon icon={Check} sx={{ fontSize: 14 }} />
        </Box>
      );
    case 'busy':
      return (
        <Box sx={common}>
          <CircularProgress size={18} />
        </Box>
      );
    case 'todo':
      return (
        <Box
          sx={{
            ...common,
            border: 2,
            borderColor: 'warning.main',
            color: 'warning.main',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {index}
        </Box>
      );
    case 'blocked':
      return (
        <Box sx={{ ...common, border: 1, borderColor: 'divider', color: 'text.disabled' }}>
          <LucideMuiIcon icon={Circle} sx={{ fontSize: 10 }} />
        </Box>
      );
  }
};

const Step: FC<{
  readonly children?: ReactNode;
  readonly index: number;
  readonly last?: boolean;
  readonly state: StepState;
  readonly title: string;
  readonly value?: ReactNode;
}> = ({ children, index, last, state, title, value }) => (
  <Stack direction="row" sx={{ gap: 1.5 }}>
    <Stack sx={{ alignItems: 'center' }}>
      <StepIcon index={index} state={state} />
      {last === true ? null : <Box sx={{ bgcolor: 'divider', flex: 1, minHeight: 12, my: 0.5, width: '1px' }} />}
    </Stack>
    <Box sx={{ flex: 1, minWidth: 0, pb: last === true ? 0 : 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minHeight: 24 }}>
        <Typography
          sx={{ color: state === 'blocked' ? 'text.disabled' : 'text.primary', fontWeight: 600 }}
          variant="body2"
        >
          {title}
        </Typography>
        {value}
      </Stack>
      {children !== undefined ? <Box sx={{ mt: 1 }}>{children}</Box> : null}
    </Box>
  </Stack>
);

const MonoValue: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Typography color="text.secondary" sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }} variant="body2">
    {children}
  </Typography>
);

const ProviderSteps: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const meta = PROVIDER_META[provider.id];
  const status = overallStatus(provider);
  const { cli, runtime } = provider;
  const steps: ReactNode[] = [];
  let index = 0;

  const cliOk = cli._tag !== 'Missing';
  if (meta.cliName !== undefined) {
    index += 1;
    steps.push(
      <Step
        index={index}
        key="cli"
        state={cliOk ? 'done' : 'todo'}
        title={`${meta.cliName} CLI`}
        value={
          cli._tag === 'Found' ? (
            <MonoValue>
              v{cli.version} · {cli.path}
            </MonoValue>
          ) : null
        }
      >
        {cliOk ? null : <ProviderHelp dense provider={provider} />}
      </Step>,
    );
  }

  const runtimeOk = runtime === undefined || runtime.active !== undefined;
  if (runtime !== undefined) {
    index += 1;
    const busy = runtime.job._tag === 'Installing' || runtime.job._tag === 'Resolving';
    steps.push(
      <Step
        index={index}
        key="runtime"
        state={runtimeOk ? 'done' : busy ? 'busy' : cliOk ? 'todo' : 'blocked'}
        title="ACP runtime"
        value={runtime.active !== undefined ? <MonoValue>v{runtime.active}</MonoValue> : null}
      >
        {busy ? (
          <InstallProgress provider={provider} />
        ) : !runtimeOk && cliOk ? (
          <Stack spacing={1}>
            <ProviderHelp dense provider={provider} />
            {status === 'needs-runtime' ? (
              <Box>
                <ProviderPrimaryAction provider={provider} />
              </Box>
            ) : null}
          </Stack>
        ) : null}
      </Step>,
    );
  }

  index += 1;
  const authDone = provider.auth === 'SignedIn';
  const authBusy = provider.auth === 'Checking' || provider.auth === 'SigningIn';
  steps.push(
    <Step
      index={index}
      key="auth"
      last
      state={authDone ? 'done' : !cliOk || !runtimeOk ? 'blocked' : authBusy ? 'busy' : 'todo'}
      title={`Signed in · ${meta.accountLabel}`}
    >
      {cliOk && runtimeOk && !authDone ? <ProviderHelp dense provider={provider} /> : null}
    </Step>,
  );

  return <Box>{steps}</Box>;
};

const VersionsFooter: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const store = useProvidersProto();
  const { runtime } = provider;
  if (runtime?.active === undefined) {
    return null;
  }
  const busy = runtime.job._tag === 'Installing' || runtime.job._tag === 'Resolving';
  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <Typography color="text.secondary" variant="body2">
          Active runtime
        </Typography>
        <Select
          onChange={event => {
            store.setActiveVersion(provider.id, event.target.value);
          }}
          renderValue={value => <MonoValue>v{value}</MonoValue>}
          size="small"
          sx={{ minWidth: 140 }}
          value={runtime.active}
        >
          {runtime.installed.toReversed().map(version => (
            <MenuItem key={version} value={version}>
              <Stack>
                <MonoValue>v{version}</MonoValue>
                <Typography color="text.disabled" sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.65rem' }}>
                  {runtimeDir(provider.id, version)}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </Select>
        <Box sx={{ flex: 1 }} />
        {busy ? (
          <InstallProgress provider={provider} />
        ) : runtime.latest._tag === 'Available' ? (
          <Button
            onClick={() => {
              store.installRuntime(provider.id);
            }}
            size="small"
            variant="contained"
          >
            Install v{runtime.latest.version}
          </Button>
        ) : runtime.latest._tag === 'UpToDate' ? (
          <Typography color="success.main" variant="body2">
            Latest installed
          </Typography>
        ) : (
          <Button
            disabled={runtime.latest._tag === 'Checking'}
            onClick={() => {
              store.checkLatest(provider.id);
            }}
            size="small"
            variant="text"
          >
            {runtime.latest._tag === 'Checking' ? 'Checking…' : 'Check for newer version'}
          </Button>
        )}
      </Stack>
    </>
  );
};

/** One provider card. Shared by Settings and the startup modal. */
const ProviderCard: FC<{ readonly defaultExpanded?: boolean; readonly provider: ProviderMock }> = ({
  defaultExpanded,
  provider,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const status = overallStatus(provider);
  const { label, tone } = STATUS_META[status];
  const meta = PROVIDER_META[provider.id];
  return (
    <Accordion
      disableGutters
      expanded={expanded && provider.enabled}
      onChange={(_event, next) => {
        if (provider.enabled) {
          setExpanded(next);
        }
      }}
      sx={{ '&::before': { display: 'none' }, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}
      variant="outlined"
    >
      <AccordionSummary
        expandIcon={
          <LucideMuiIcon
            icon={ChevronDown}
            sx={{ fontSize: 18, visibility: provider.enabled ? 'visible' : 'hidden' }}
          />
        }
        sx={{
          '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5, my: 1.5 },
          cursor: provider.enabled ? 'pointer' : 'default',
          px: 2,
        }}
      >
        <Box sx={{ opacity: provider.enabled ? 1 : 0.5 }}>
          <AgentLaunchTargetIcon launchTarget={provider.id} size={28} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, opacity: provider.enabled ? 1 : 0.5 }}>
          <Typography sx={{ fontWeight: 600 }}>{meta.label}</Typography>
          <Typography color="text.secondary" variant="caption">
            {meta.runtimeKind === undefined ? `${meta.cliName ?? ''} CLI` : (meta.runtimePackage ?? '')}
          </Typography>
        </Box>
        <Chip
          color={chipColor(tone)}
          icon={
            status === 'ready' ? (
              <LucideMuiIcon icon={Check} sx={{ fontSize: 14 }} />
            ) : status === 'unavailable' || status === 'install-failed' ? (
              <LucideMuiIcon icon={X} sx={{ fontSize: 14 }} />
            ) : undefined
          }
          label={label}
          size="small"
          variant="outlined"
        />
        {/* stopPropagation so clicking the action doesn't toggle the card */}
        <Box
          onClick={event => {
            event.stopPropagation();
          }}
          sx={{ display: 'flex', justifyContent: 'flex-end', minWidth: 88 }}
        >
          <ProviderPrimaryAction provider={provider} />
        </Box>
        <ProviderEnabledSwitch provider={provider} />
      </AccordionSummary>
      <AccordionDetails sx={{ bgcolor: 'action.hover', borderColor: 'divider', borderTop: 1, px: 2.5, py: 2 }}>
        <ProviderSteps provider={provider} />
        <VersionsFooter provider={provider} />
      </AccordionDetails>
    </Accordion>
  );
};

export const VariantBSettings: FC = () => {
  const store = useProvidersProto();
  const checkedLabel = useCheckedLabel(store.checkedAt);
  const enabled = store.providers.filter(p => p.enabled);
  const ready = enabled.filter(p => overallStatus(p) === 'ready').length;
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h6">Providers</Typography>
        <Typography color="text.secondary" variant="body2">
          {ready} of {enabled.length} enabled ready · {checkedLabel.toLowerCase()} ·{' '}
          <Box
            component="button"
            onClick={store.recheckAll}
            sx={{ all: 'unset', color: 'primary.main', cursor: 'pointer' }}
          >
            Re-check all
          </Box>
        </Typography>
      </Box>
      <Stack spacing={1.25}>
        {store.providers.map(p => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </Stack>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 2, py: 1.5 }}>
        <FormControlLabel
          control={
            <Switch
              checked={store.showOnStartup}
              onChange={(_event, checked) => {
                store.setShowOnStartup(checked);
              }}
            />
          }
          label={
            <Box>
              <Typography variant="body2">Show Providers on startup</Typography>
              <Typography color="text.secondary" variant="caption">
                Opens the Providers window each time the app starts.
              </Typography>
            </Box>
          }
        />
      </Box>
    </Stack>
  );
};

export const VariantBStartupModal: FC<{ readonly onClose: () => void; readonly open: boolean }> = ({
  onClose,
  open,
}) => {
  const store = useProvidersProto();
  return (
    <ProvidersStartupDialog onClose={onClose} open={open}>
      <Stack spacing={1}>
        {store.providers.map(p => (
          <ProviderCard defaultExpanded={overallStatus(p) !== 'ready'} key={p.id} provider={p} />
        ))}
      </Stack>
    </ProvidersStartupDialog>
  );
};
