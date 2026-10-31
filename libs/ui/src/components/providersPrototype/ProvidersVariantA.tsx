/**
 * PROTOTYPE (#175) — Variant A: master–detail (T3Code-style).
 * Left rail = provider list w/ status headline; right = sectioned detail rows (label left, control right).
 * Startup modal reuses the rail item + primary action inline.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Check, RefreshCw, Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { FC, ReactNode } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import {
  activeVersionLabel,
  overallStatus,
  PROVIDER_META,
  runtimeActionLabel,
  runtimeDir,
  STATUS_META,
  statusHeadline,
} from './providersPrototype.model.ts';
import type { ProviderMock } from './providersPrototype.model.ts';
import {
  InstallProgress,
  ProviderEnabledSwitch,
  ProviderHelp,
  ProviderPrimaryAction,
  ProvidersStartupDialog,
  StatusDot,
  toneColor,
  useCheckedLabel,
} from './providersPrototype.shared.tsx';
import { useProvidersProto } from './providersPrototype.store.tsx';

const Mono: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Box component="span" sx={{ color: 'text.secondary', fontFamily: FONT_FAMILY_MONO, fontSize: '0.8rem' }}>
    {children}
  </Box>
);

/** Rail item: icon, name + version, status headline. Shared by Settings rail and startup modal. */
const ProviderItem: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const status = overallStatus(provider);
  const { tone } = STATUS_META[status];
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
          {version !== undefined ? <Mono>{version}</Mono> : null}
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

const SectionTitle: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Typography color="text.secondary" sx={{ mb: 1, mt: 3, px: 1 }} variant="subtitle2">
    {children}
  </Typography>
);

const Group: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Box
    sx={{
      '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' },
      border: 1,
      borderColor: 'divider',
      borderRadius: 2,
    }}
  >
    {children}
  </Box>
);

const Row: FC<{
  readonly below?: ReactNode;
  readonly children?: ReactNode;
  readonly description: ReactNode;
  readonly title: ReactNode;
}> = ({ below, children, description, title }) => (
  <Box sx={{ px: 2.5, py: 2 }}>
    <Stack direction="row" sx={{ alignItems: 'center', gap: 3, justifyContent: 'space-between' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography color="text.secondary" variant="body2">
          {description}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 1 }}>
        {children}
      </Stack>
    </Stack>
    {below !== undefined && below !== null ? <Box sx={{ mt: 1.5 }}>{below}</Box> : null}
  </Box>
);

const UpdateControl: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const store = useProvidersProto();
  const { runtime } = provider;
  if (runtime === undefined) {
    return null;
  }
  if (runtime.job._tag === 'Installing' || runtime.job._tag === 'Resolving') {
    return <InstallProgress provider={provider} />;
  }
  switch (runtime.latest._tag) {
    case 'Idle':
      return (
        <Button
          onClick={() => {
            store.checkLatest(provider.id);
          }}
          size="small"
          variant="outlined"
        >
          Check for latest
        </Button>
      );
    case 'Checking':
      return (
        <Button disabled size="small" variant="outlined">
          Checking…
        </Button>
      );
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
            store.installRuntime(provider.id);
          }}
          size="small"
          variant="contained"
        >
          Install v{runtime.latest.version}
        </Button>
      );
  }
};

const ProviderDetailSections: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const store = useProvidersProto();
  const meta = PROVIDER_META[provider.id];
  const status = overallStatus(provider);
  const { runtime } = provider;
  const runtimeBusy = runtime !== undefined && (runtime.job._tag === 'Installing' || runtime.job._tag === 'Resolving');

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
          <ProviderPrimaryAction provider={provider} />
        </Row>
      </Group>

      <SectionTitle>Requirements</SectionTitle>
      <Group>
        {meta.cliName !== undefined ? (
          <Row
            description={
              <>
                <code>{meta.cliName}</code> on your PATH. Installed and updated by you.
              </>
            }
            title="CLI"
          >
            {provider.cli._tag === 'Found' ? (
              <Stack sx={{ alignItems: 'flex-end' }}>
                <Mono>v{provider.cli.version}</Mono>
                <Typography color="text.disabled" sx={{ fontFamily: FONT_FAMILY_MONO }} variant="caption">
                  {provider.cli.path}
                </Typography>
              </Stack>
            ) : (
              <Typography color="error" variant="body2">
                Not found
              </Typography>
            )}
          </Row>
        ) : null}
        {runtime !== undefined ? (
          <Row
            description={
              <>
                <code>{meta.runtimePackage}</code>
                {meta.runtimeKind === 'npm' ? ' from npm' : ' from the ACP registry'}, managed by the app.
              </>
            }
            title="ACP runtime"
          >
            {runtime.active !== undefined ? (
              <Mono>v{runtime.active}</Mono>
            ) : runtimeBusy ? (
              <InstallProgress provider={provider} />
            ) : provider.cli._tag === 'Missing' ? (
              <Tooltip title={`Install ${meta.cliName ?? 'the CLI'} first`}>
                <span>
                  <Button disabled size="small" variant="contained">
                    {runtimeActionLabel(provider.id)}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                onClick={() => {
                  store.installRuntime(provider.id);
                }}
                size="small"
                variant="contained"
              >
                {runtime.job._tag === 'Failed' ? 'Retry' : runtimeActionLabel(provider.id)}
              </Button>
            )}
          </Row>
        ) : null}
        <Row
          description={
            meta.signIn._tag === 'InApp' ? 'Google OAuth in your browser.' : `Run ${meta.signIn.command} to sign in.`
          }
          title={`Sign-in · ${meta.accountLabel}`}
        >
          <Typography
            color={
              provider.auth === 'SignedIn'
                ? 'success.main'
                : provider.auth === 'NotSignedIn'
                  ? 'warning.main'
                  : 'text.secondary'
            }
            variant="body2"
          >
            {provider.auth === 'SignedIn'
              ? 'Signed in'
              : provider.auth === 'NotSignedIn'
                ? 'Not signed in'
                : provider.auth === 'SigningIn'
                  ? 'Signing in…'
                  : provider.auth === 'Checking'
                    ? 'Checking…'
                    : '—'}
          </Typography>
        </Row>
      </Group>

      {runtime !== undefined && runtime.installed.length > 0 ? (
        <>
          <SectionTitle>Runtime versions</SectionTitle>
          <Group>
            <Row
              description={
                meta.runtimeKind === 'npm'
                  ? `Resolves npm's latest for ${meta.runtimePackage ?? ''} and installs it alongside existing versions.`
                  : 'Resolves the latest version from the ACP registry and installs it alongside existing versions.'
              }
              title="Updates"
            >
              <UpdateControl provider={provider} />
            </Row>
            {runtime.installed.toReversed().map(version => (
              <Row description={<Mono>{runtimeDir(provider.id, version)}</Mono>} key={version} title={`v${version}`}>
                {runtime.active === version ? (
                  <Chip color="success" label="Active" size="small" variant="outlined" />
                ) : (
                  <>
                    <Button
                      onClick={() => {
                        store.setActiveVersion(provider.id, version);
                      }}
                      size="small"
                    >
                      Use
                    </Button>
                    <Tooltip title="Remove">
                      <IconButton
                        onClick={() => {
                          store.removeVersion(provider.id, version);
                        }}
                        size="small"
                      >
                        <LucideMuiIcon icon={Trash2} sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Row>
            ))}
          </Group>
        </>
      ) : null}
    </>
  );
};

const ProviderDetail: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const meta = PROVIDER_META[provider.id];

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, mb: 2, px: 1 }}>
        <AgentLaunchTargetIcon launchTarget={provider.id} size={22} />
        <Typography sx={{ flex: 1 }} variant="h6">
          {meta.label}
        </Typography>
        <Mono>{activeVersionLabel(provider) ?? '—'}</Mono>
        <ProviderEnabledSwitch provider={provider} size="medium" />
      </Stack>

      {provider.enabled ? null : (
        <Group>
          <Row
            description={`Turn on to set up ${meta.label} and use it in new sessions. Installed runtimes are kept.`}
            title="Disabled"
          />
        </Group>
      )}
      {provider.enabled ? <ProviderDetailSections provider={provider} /> : null}
    </Box>
  );
};

export const VariantASettings: FC = () => {
  const store = useProvidersProto();
  const [selected, setSelected] = useState<AgentLaunchTarget>('claude-agent-acp');
  const checkedLabel = useCheckedLabel(store.checkedAt);
  const selectedProvider = store.providers.find(p => p.id === selected) ?? store.providers[0];

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
        <Typography sx={{ flex: 1 }} variant="h6">
          Providers
        </Typography>
        <Button
          color="inherit"
          onClick={store.recheckAll}
          size="small"
          startIcon={<LucideMuiIcon icon={RefreshCw} sx={{ fontSize: 16 }} />}
        >
          {checkedLabel}
        </Button>
      </Stack>
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 3,
          display: 'flex',
          height: 'calc(100vh - 240px)',
          minHeight: 480,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ borderColor: 'divider', borderRight: 1, flexShrink: 0, overflow: 'auto', width: 300 }}>
          {store.providers.map(p => (
            <Box
              key={p.id}
              onClick={() => {
                setSelected(p.id);
              }}
              sx={{
                cursor: 'pointer',
                alignItems: 'center',
                bgcolor: p.id === selected ? 'action.selected' : undefined,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                gap: 1,
                justifyContent: 'space-between',
                px: 2,
                py: 1.75,
                textAlign: 'left',
                width: '100%',
              }}
            >
              <ProviderItem provider={p} />
              <ProviderEnabledSwitch provider={p} />
            </Box>
          ))}
          <Box sx={{ p: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={store.showOnStartup}
                  onChange={(_event, checked) => {
                    store.setShowOnStartup(checked);
                  }}
                  size="small"
                />
              }
              label={<Typography variant="body2">Show Providers on startup</Typography>}
            />
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', p: 3 }}>
          <ProviderDetail provider={selectedProvider} />
        </Box>
      </Box>
    </Stack>
  );
};

export const VariantAStartupModal: FC<{ readonly onClose: () => void; readonly open: boolean }> = ({
  onClose,
  open,
}) => {
  const store = useProvidersProto();
  return (
    <ProvidersStartupDialog onClose={onClose} open={open}>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
        {store.providers.map((p, index) => (
          <Fragment key={p.id}>
            <Box sx={{ borderColor: 'divider', borderTop: index === 0 ? 0 : 1, px: 2, py: 1.5 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 2, justifyContent: 'space-between' }}>
                <ProviderItem provider={p} />
                <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 1 }}>
                  <InstallProgress provider={p} />
                  <ProviderPrimaryAction provider={p} />
                  <ProviderEnabledSwitch provider={p} />
                </Stack>
              </Stack>
              {!['disabled', 'needs-runtime', 'ready'].includes(overallStatus(p)) ? (
                <Box sx={{ mt: 1.25, pl: 4.5 }}>
                  <ProviderHelp dense provider={p} />
                </Box>
              ) : null}
            </Box>
          </Fragment>
        ))}
      </Box>
    </ProvidersStartupDialog>
  );
};
