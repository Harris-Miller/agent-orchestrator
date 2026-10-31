/**
 * PROTOTYPE (#175) — Variant C: requirements matrix.
 * Rows = providers, columns = CLI / Runtime / Sign-in (the issue's table, made live). Each cell is
 * either a ✓ + value or the action for that requirement. Clicking a row opens a details drawer row
 * with fix instructions + runtime versions. Bulk "Check for updates" in the toolbar.
 * Startup modal is the same matrix, compact (no expand, help inline).
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { ArrowUpCircle, Check, ChevronRight, Minus, RefreshCw, X } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { FC, ReactNode } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { overallStatus, PROVIDER_META, runtimeActionLabel, runtimeDir } from './providersPrototype.model.ts';
import type { ProviderMock } from './providersPrototype.model.ts';
import {
  InstallProgress,
  ProviderEnabledSwitch,
  ProviderHelp,
  ProvidersStartupDialog,
  StatusDot,
  useCheckedLabel,
} from './providersPrototype.shared.tsx';
import { useProvidersProto } from './providersPrototype.store.tsx';

const Ok: FC<{ readonly children?: ReactNode }> = ({ children }) => (
  <Stack direction="row" sx={{ alignItems: 'center', color: 'success.main', gap: 0.75 }}>
    <LucideMuiIcon icon={Check} sx={{ fontSize: 16 }} />
    {children !== undefined ? (
      <Typography color="text.secondary" sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }} variant="body2">
        {children}
      </Typography>
    ) : null}
  </Stack>
);

const Bad: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Stack direction="row" sx={{ alignItems: 'center', color: 'error.main', gap: 0.75 }}>
    <LucideMuiIcon icon={X} sx={{ fontSize: 16 }} />
    <Typography variant="body2">{children}</Typography>
  </Stack>
);

const NotNeeded: FC = () => (
  <Stack direction="row" sx={{ alignItems: 'center', color: 'text.disabled', gap: 0.75 }}>
    <LucideMuiIcon icon={Minus} sx={{ fontSize: 16 }} />
    <Typography variant="caption">not needed</Typography>
  </Stack>
);

const Waiting: FC = () => (
  <Typography color="text.disabled" variant="caption">
    waiting on previous step
  </Typography>
);

const CliCell: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const store = useProvidersProto();
  const { cli } = provider;
  switch (cli._tag) {
    case 'NotRequired':
      return <NotNeeded />;
    case 'Found':
      return <Ok>v{cli.version}</Ok>;
    case 'Missing':
      return (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Bad>Not found</Bad>
          <Button
            onClick={() => {
              store.recheck(provider.id);
            }}
            size="small"
          >
            Re-check
          </Button>
        </Stack>
      );
  }
};

const RuntimeCell: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const store = useProvidersProto();
  const { runtime } = provider;
  if (runtime === undefined) {
    return <NotNeeded />;
  }
  if (runtime.job._tag === 'Installing' || runtime.job._tag === 'Resolving') {
    return <InstallProgress provider={provider} />;
  }
  if (runtime.active !== undefined) {
    return (
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Ok>v{runtime.active}</Ok>
        {runtime.latest._tag === 'Available' ? (
          <Button
            onClick={() => {
              store.installRuntime(provider.id);
            }}
            size="small"
            startIcon={<LucideMuiIcon icon={ArrowUpCircle} sx={{ fontSize: 14 }} />}
          >
            v{runtime.latest.version}
          </Button>
        ) : null}
        {runtime.latest._tag === 'Checking' ? <CircularProgress size={14} /> : null}
      </Stack>
    );
  }
  if (provider.cli._tag === 'Missing') {
    return <Waiting />;
  }
  return runtime.job._tag === 'Failed' ? (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
      <Bad>Failed</Bad>
      <Button
        color="error"
        onClick={() => {
          store.installRuntime(provider.id);
        }}
        size="small"
      >
        Retry
      </Button>
    </Stack>
  ) : (
    <Button
      onClick={() => {
        store.installRuntime(provider.id);
      }}
      size="small"
      variant="contained"
    >
      {runtimeActionLabel(provider.id)}
    </Button>
  );
};

const AuthCell: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const store = useProvidersProto();
  const meta = PROVIDER_META[provider.id];
  const blocked =
    provider.cli._tag === 'Missing' || (provider.runtime !== undefined && provider.runtime.active === undefined);
  if (blocked) {
    return <Waiting />;
  }
  switch (provider.auth) {
    case 'SignedIn':
      return <Ok>{meta.accountLabel}</Ok>;
    case 'Checking':
    case 'Unknown':
    case 'SigningIn':
      return (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <CircularProgress size={14} />
          <Typography color="text.secondary" variant="caption">
            {provider.auth === 'SigningIn' ? 'Signing in…' : 'Checking…'}
          </Typography>
        </Stack>
      );
    case 'NotSignedIn':
      return meta.signIn._tag === 'InApp' ? (
        <Button
          onClick={() => {
            store.signIn(provider.id);
          }}
          size="small"
          variant="contained"
        >
          Sign in
        </Button>
      ) : (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Typography color="warning.main" variant="body2">
            Run{' '}
            <Box component="code" sx={{ fontFamily: FONT_FAMILY_MONO }}>
              {meta.signIn.command}
            </Box>
          </Typography>
          <IconButton
            aria-label="Re-check"
            onClick={() => {
              store.recheck(provider.id);
            }}
            size="small"
          >
            <LucideMuiIcon icon={RefreshCw} sx={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
      );
  }
};

const ExpandedDetails: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const store = useProvidersProto();
  const { runtime } = provider;
  return (
    <Stack direction="row" sx={{ gap: 4, px: 2, py: 2 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography color="text.secondary" sx={{ mb: 1 }} variant="overline">
          {overallStatus(provider) === 'ready' ? 'Status' : 'How to fix'}
        </Typography>
        {overallStatus(provider) === 'ready' ? (
          <Typography color="text.secondary" variant="body2">
            Ready to launch.
          </Typography>
        ) : (
          <ProviderHelp provider={provider} />
        )}
      </Box>
      {runtime !== undefined && runtime.installed.length > 0 ? (
        <Box sx={{ flexShrink: 0, width: 320 }}>
          <Typography color="text.secondary" sx={{ mb: 1 }} variant="overline">
            Installed runtimes
          </Typography>
          <Stack spacing={0.5}>
            {runtime.installed.toReversed().map(version => (
              <Stack direction="row" key={version} sx={{ alignItems: 'center', gap: 1 }}>
                <Box
                  component="input"
                  checked={runtime.active === version}
                  name={`active-${provider.id}`}
                  onChange={() => {
                    store.setActiveVersion(provider.id, version);
                  }}
                  type="radio"
                />
                <Typography sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }}>v{version}</Typography>
                <Typography color="text.disabled" noWrap sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.65rem' }}>
                  {runtimeDir(provider.id, version)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
};

/** The matrix. `compact` = startup modal (no row expansion, help inline under blocked rows). */
const ProvidersMatrix: FC<{ readonly compact?: boolean }> = ({ compact }) => {
  const store = useProvidersProto();
  const [expanded, setExpanded] = useState<AgentLaunchTarget | undefined>(undefined);
  const columns = compact === true ? 5 : 6;
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
        <TableHead>
          <TableRow sx={{ '& th': { color: 'text.secondary', fontSize: '0.75rem', fontWeight: 600 } }}>
            <TableCell padding="checkbox" sx={{ pl: 1.5 }}>
              On
            </TableCell>
            <TableCell>Provider</TableCell>
            <TableCell>CLI on PATH</TableCell>
            <TableCell>ACP runtime</TableCell>
            <TableCell>Signed in</TableCell>
            {compact === true ? null : <TableCell padding="checkbox" />}
          </TableRow>
        </TableHead>
        <TableBody>
          {store.providers.map(p => {
            const status = overallStatus(p);
            const isOpen = expanded === p.id && p.enabled;
            const showInlineHelp =
              compact === true && !['disabled', 'installing', 'needs-runtime', 'ready'].includes(status);
            return (
              <Fragment key={p.id}>
                <TableRow
                  hover={compact !== true}
                  onClick={
                    compact === true || !p.enabled
                      ? undefined
                      : () => {
                          setExpanded(isOpen ? undefined : p.id);
                        }
                  }
                  sx={{
                    '& > td': { borderBottom: isOpen || showInlineHelp ? 0 : undefined, py: 1.25 },
                    cursor: compact === true || !p.enabled ? 'default' : 'pointer',
                  }}
                >
                  <TableCell padding="checkbox" sx={{ pl: 1 }}>
                    <ProviderEnabledSwitch provider={p} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, opacity: p.enabled ? 1 : 0.5 }}>
                      <StatusDot provider={p} />
                      <AgentLaunchTargetIcon launchTarget={p.id} size={18} />
                      <Typography sx={{ fontWeight: 600 }} variant="body2">
                        {PROVIDER_META[p.id].label}
                      </Typography>
                    </Stack>
                  </TableCell>
                  {p.enabled ? (
                    <>
                      <TableCell
                        onClick={event => {
                          event.stopPropagation();
                        }}
                      >
                        <CliCell provider={p} />
                      </TableCell>
                      <TableCell
                        onClick={event => {
                          event.stopPropagation();
                        }}
                      >
                        <RuntimeCell provider={p} />
                      </TableCell>
                      <TableCell
                        onClick={event => {
                          event.stopPropagation();
                        }}
                      >
                        <AuthCell provider={p} />
                      </TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={3}>
                      <Typography color="text.disabled" variant="body2">
                        Disabled — turn on to set up {PROVIDER_META[p.id].label}.
                      </Typography>
                    </TableCell>
                  )}
                  {compact === true ? null : (
                    <TableCell padding="checkbox">
                      <LucideMuiIcon
                        icon={ChevronRight}
                        sx={{
                          color: 'text.secondary',
                          visibility: p.enabled ? 'visible' : 'hidden',
                          fontSize: 16,
                          transform: isOpen ? 'rotate(90deg)' : undefined,
                          transition: 'transform 120ms',
                        }}
                      />
                    </TableCell>
                  )}
                </TableRow>
                {showInlineHelp ? (
                  <TableRow>
                    <TableCell colSpan={columns} sx={{ pb: 1.5, pl: 6, pt: 0 }}>
                      <ProviderHelp dense provider={p} />
                    </TableCell>
                  </TableRow>
                ) : null}
                {compact === true ? null : (
                  <TableRow>
                    <TableCell
                      colSpan={columns}
                      sx={{ bgcolor: 'action.hover', borderBottom: isOpen ? undefined : 0, p: 0 }}
                    >
                      <Collapse in={isOpen} unmountOnExit>
                        <ExpandedDetails provider={p} />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
};

export const VariantCSettings: FC = () => {
  const store = useProvidersProto();
  const checkedLabel = useCheckedLabel(store.checkedAt);
  const installed = store.providers.filter(p => p.runtime?.active !== undefined);
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6">Providers</Typography>
        <Typography color="text.secondary" variant="body2">
          Each provider needs every requirement in its row. Click a row for details and installed runtime versions.
        </Typography>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={store.showOnStartup}
              onChange={(_event, checked) => {
                store.setShowOnStartup(checked);
              }}
              size="small"
            />
          }
          label={<Typography variant="body2">Show Providers on startup</Typography>}
          sx={{ flex: 1 }}
        />
        <Button
          disabled={installed.length === 0}
          onClick={() => {
            for (const p of installed) {
              store.checkLatest(p.id);
            }
          }}
          size="small"
          startIcon={<LucideMuiIcon icon={ArrowUpCircle} sx={{ fontSize: 16 }} />}
          variant="outlined"
        >
          Check for updates
        </Button>
        <Button
          onClick={store.recheckAll}
          size="small"
          startIcon={<LucideMuiIcon icon={RefreshCw} sx={{ fontSize: 16 }} />}
          variant="outlined"
        >
          {checkedLabel}
        </Button>
      </Stack>
      <ProvidersMatrix />
    </Stack>
  );
};

export const VariantCStartupModal: FC<{ readonly onClose: () => void; readonly open: boolean }> = ({
  onClose,
  open,
}) => (
  <ProvidersStartupDialog maxWidth="md" onClose={onClose} open={open}>
    <ProvidersMatrix compact />
  </ProvidersStartupDialog>
);
