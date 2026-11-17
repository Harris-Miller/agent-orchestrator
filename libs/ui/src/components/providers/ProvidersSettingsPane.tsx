/** Settings > Providers: master-detail (rail of providers, sectioned detail). */
import { useAtom } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import { Check } from 'lucide-react';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import { showProvidersOnStartupAtom } from '../../atoms/boundHarnessAtoms.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import {
  activeVersionLabel,
  overallStatus,
  PROVIDER_META,
  readyToInstallVersion,
  runtimeDirLabel,
  STATUS_META,
  statusHeadline,
} from '../../host/providerView.ts';
import type { ProviderView } from '../../host/providerView.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import {
  SettingsGroup as Group,
  SettingsRow as Row,
  SettingsSectionTitle as SectionTitle,
} from '../SettingsSection.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import {
  ProviderEnabledSwitch,
  ProviderHelp,
  ProviderPrimaryAction,
  StatusDot,
  toneColor,
  useProviderControls,
} from './providerUi.tsx';
import type { ProviderRequest } from './providerUi.tsx';
import { ProviderModelsSection } from './ProviderModelsSection.tsx';
import { VscodeExtensionRow } from './VscodeExtensionRow.tsx';

const Mono: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Box component="span" sx={{ color: 'text.secondary', fontFamily: FONT_FAMILY_MONO, fontSize: '0.8rem' }}>
    {children}
  </Box>
);

/** Rail item: icon, name + active version, status headline. */
const ProviderItem: FC<{ readonly provider: ProviderView }> = ({ provider }) => {
  const { tone } = STATUS_META[overallStatus(provider)];
  const version = activeVersionLabel(provider);
  return (
    <Stack
      direction="row"
      sx={{ alignItems: 'flex-start', gap: 1.5, minWidth: 0, opacity: provider.enabled ? 1 : 0.55 }}
    >
      <Box sx={{ pt: 0.25 }}>
        <AgentLaunchTargetIcon launchTarget={provider.id} size={20} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1 }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {PROVIDER_META[provider.id].label}
          </Typography>
          {version === undefined ? null : <Mono>{version}</Mono>}
        </Stack>
        <Typography
          sx={{ color: tone === 'success' || tone === 'neutral' ? 'text.secondary' : toneColor(tone) }}
          variant="body2"
        >
          {statusHeadline(provider)}
        </Typography>
      </Box>
    </Stack>
  );
};

const Spinner: FC<{ readonly label: string }> = ({ label }) => (
  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
    <CircularProgress size={16} />
    <Typography variant="body2">{label}</Typography>
  </Stack>
);

/** Check for latest / Download / Install, with an indeterminate spinner while a job runs. */
const UpdateControl: FC<{ readonly provider: ProviderView; readonly request: ProviderRequest }> = ({
  provider,
  request,
}) => {
  const { runtime } = provider;
  if (runtime === undefined) {
    return null;
  }
  const { job, latest } = runtime;
  if (job._tag === 'Downloading') {
    return <Spinner label={`Downloading v${job.version}…`} />;
  }
  if (job._tag === 'Installing') {
    return <Spinner label={`Installing v${job.version}…`} />;
  }
  if (job._tag === 'Removing') {
    return <Spinner label="Removing…" />;
  }
  const ready = readyToInstallVersion(provider);
  if (ready !== undefined) {
    return (
      <Button
        onClick={() => {
          request({ kind: 'install' }, provider.id);
        }}
        size="small"
        variant="contained"
      >
        Install v{ready}
      </Button>
    );
  }
  switch (latest._tag) {
    case 'Checking':
      return <Spinner label="Checking…" />;
    case 'UpToDate':
      return (
        <Stack direction="row" sx={{ alignItems: 'center', color: 'success.main', gap: 0.5 }}>
          <LucideMuiIcon icon={Check} sx={{ fontSize: 16 }} />
          <Typography variant="body2">Up to date</Typography>
        </Stack>
      );
    case 'Available':
      return (
        <Button
          onClick={() => {
            request({ kind: 'download' }, provider.id);
          }}
          size="small"
          variant="contained"
        >
          Download v{latest.version}
        </Button>
      );
    case 'Failed':
    case 'Idle':
      return (
        <Button
          onClick={() => {
            request({ kind: 'checkLatest' }, provider.id);
          }}
          size="small"
          variant="outlined"
        >
          Check for latest
        </Button>
      );
  }
};

const ProviderDetail: FC<{ readonly provider: ProviderView; readonly request: ProviderRequest }> = ({
  provider,
  request,
}) => {
  const meta = PROVIDER_META[provider.id];
  const status = overallStatus(provider);
  const { runtime } = provider;
  const busy = runtime !== undefined && runtime.job._tag !== 'Idle' && runtime.job._tag !== 'Failed';

  return (
    <>
      <Group>
        <Row
          below={<ProviderHelp provider={provider} />}
          description={statusHeadline(provider)}
          title={
            <Stack component="span" direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <StatusDot provider={provider} />
              {STATUS_META[status].label}
            </Stack>
          }
        >
          <ProviderPrimaryAction provider={provider} request={request} />
        </Row>
      </Group>

      <SectionTitle>Requirements</SectionTitle>
      <Group>
        {meta.cliName === undefined ? null : (
          <Row
            description={
              provider.cli._tag === 'Found' ? <Mono>{provider.cli.path}</Mono> : `${meta.cliName} not found on PATH`
            }
            title={`${meta.cliName} CLI`}
          >
            <Button
              disabled={busy}
              onClick={() => {
                request({ kind: 'recheck' }, provider.id);
              }}
              size="small"
              variant="outlined"
            >
              Recheck
            </Button>
          </Row>
        )}
        {runtime === undefined ? null : (
          <>
            <Row
              below={
                runtime.documentError === undefined ? null : (
                  <Alert severity="error">Provider state is unreadable: {runtime.documentError}</Alert>
                )
              }
              description={
                runtime.active === undefined ? (
                  'No runtime downloaded'
                ) : (
                  <Mono>{runtimeDirLabel(provider.id, runtime.active)}</Mono>
                )
              }
              title={`Runtime${runtime.active === undefined ? '' : ` v${runtime.active}`}`}
            >
              <UpdateControl provider={provider} request={request} />
            </Row>
            {runtime.latest._tag === 'Failed' ? (
              <Box sx={{ px: 2.5, py: 1.5 }}>
                <Alert severity="warning">Could not check for the latest version: {runtime.latest.message}</Alert>
              </Box>
            ) : null}
            {runtime.job._tag === 'Failed' && runtime.active !== undefined ? (
              <Box sx={{ px: 2.5, py: 1.5 }}>
                <Alert severity="error">{runtime.job.message}</Alert>
              </Box>
            ) : null}
            {runtime.cleanupFailures.length > 0 ? (
              <Box sx={{ px: 2.5, py: 1.5 }}>
                <Alert severity="warning">
                  Could not delete {runtime.cleanupFailures.map(failure => `v${failure.version}`).join(', ')}; it will
                  be retried at startup.
                </Alert>
              </Box>
            ) : null}
            {runtime.active === undefined ? null : (
              <Row
                description="Deletes all downloaded runtimes. Credentials and your enable preference are kept."
                title="Remove runtime"
              >
                <Button
                  color="error"
                  disabled={busy}
                  onClick={() => {
                    request({ kind: 'remove' }, provider.id);
                  }}
                  size="small"
                  variant="outlined"
                >
                  Remove
                </Button>
              </Row>
            )}
          </>
        )}
      </Group>

      <ProviderModelsSection launchTarget={provider.id} />
    </>
  );
};

export const ProvidersSettingsPane: FC = () => {
  const { dialog, providers, request } = useProviderControls();
  const [selected, setSelected] = useState<AgentLaunchTarget>('claude-agent-acp');
  const [showOnStartup, setShowOnStartup] = useAtom(showProvidersOnStartupAtom);
  const selectedProvider = providers.find(provider => provider.id === selected) ?? providers[0];

  return (
    <Stack spacing={2}>
      <Box
        sx={theme => ({
          border: 1,
          borderColor: 'divider',
          borderRadius: 3,
          display: 'flex',
          flexDirection: 'column',
          [theme.breakpoints.up('lg')]: { flexDirection: 'row' },
          minHeight: 480,
          overflow: 'hidden',
        })}
      >
        <Box
          sx={theme => ({
            borderColor: 'divider',
            borderRight: 1,
            flexShrink: 0,
            overflow: 'auto',
            width: '100%',
            [theme.breakpoints.up('lg')]: { width: 240 },
          })}
        >
          {providers.map(provider => (
            <Box
              key={provider.id}
              onClick={() => {
                setSelected(provider.id);
              }}
              sx={{
                alignItems: 'center',
                bgcolor: provider.id === selected ? 'action.selected' : undefined,
                borderBottom: 1,
                borderColor: 'divider',
                cursor: 'pointer',
                display: 'flex',
                gap: 1,
                justifyContent: 'space-between',
                px: 2,
                py: 1.75,
                width: '100%',
              }}
            >
              <ProviderItem provider={provider} />
              <ProviderEnabledSwitch provider={provider} request={request} />
            </Box>
          ))}
          <Box sx={{ p: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={showOnStartup}
                  onChange={(_event, checked) => {
                    setShowOnStartup(checked);
                  }}
                  size="small"
                />
              }
              label={<Typography variant="body2">Show Providers on startup</Typography>}
            />
          </Box>
          <VscodeExtensionRow />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', p: 3 }}>
          <ProviderDetail key={selectedProvider.id} provider={selectedProvider} request={request} />
        </Box>
      </Box>
      {dialog}
    </Stack>
  );
};

export { ProviderItem };
