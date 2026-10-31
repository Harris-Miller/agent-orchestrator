/**
 * PROTOTYPE (#175) — throwaway. Small pieces every variant may reuse: status dot, command snippet,
 * primary action, "how to fix" help, the Providers startup modal frame, and the Node prerequisite modal.
 */
import { OpenUrl } from '@lib/context-services';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Effect } from 'effect';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { overallStatus, PROVIDER_META, runtimeActionLabel, STATUS_META } from './providersPrototype.model.ts';
import type { ProviderMock, StatusTone } from './providersPrototype.model.ts';
import { useProvidersProto } from './providersPrototype.store.tsx';

export const toneColor = (tone: StatusTone): string => {
  switch (tone) {
    case 'error':
      return 'error.main';
    case 'info':
      return 'info.main';
    case 'neutral':
      return 'text.disabled';
    case 'success':
      return 'success.main';
    case 'warning':
      return 'warning.main';
  }
};

/** Per-provider enable toggle. Stops propagation so it can sit inside clickable rows / accordion summaries. */
export const ProviderEnabledSwitch: FC<{ readonly provider: ProviderMock; readonly size?: 'medium' | 'small' }> = ({
  provider,
  size = 'small',
}) => {
  const store = useProvidersProto();
  return (
    <Switch
      checked={provider.enabled}
      onChange={(_event, checked) => {
        store.setEnabled(provider.id, checked);
      }}
      onClick={event => {
        event.stopPropagation();
      }}
      size={size}
      slotProps={{ input: { 'aria-label': `Enable ${PROVIDER_META[provider.id].label}` } }}
    />
  );
};

export const StatusDot: FC<{ readonly provider: ProviderMock; readonly size?: number }> = ({ provider, size = 8 }) => {
  const { label, tone } = STATUS_META[overallStatus(provider)];
  return (
    <Tooltip title={label}>
      <Box sx={{ bgcolor: toneColor(tone), borderRadius: '50%', flexShrink: 0, height: size, width: size }} />
    </Tooltip>
  );
};

export const openExternal = (url: string): void => {
  hostRunPromise(
    Effect.gen(function* () {
      const openUrl = yield* OpenUrl;
      yield* openUrl.open(url);
    }),
  ).catch(() => undefined);
};

export const CommandSnippet: FC<{ readonly command: string; readonly label?: string }> = ({ command, label }) => (
  <Stack
    direction="row"
    sx={{
      alignItems: 'center',
      bgcolor: 'action.hover',
      borderRadius: 1,
      gap: 1,
      pl: 1.25,
      pr: 0.5,
      py: 0.25,
    }}
  >
    {label !== undefined ? (
      <Typography color="text.secondary" sx={{ flexShrink: 0, minWidth: 96 }} variant="caption">
        {label}
      </Typography>
    ) : null}
    <Typography component="code" sx={{ flex: 1, fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }} variant="body2">
      {command}
    </Typography>
    <IconButton
      aria-label="Copy command"
      onClick={() => {
        hostRunPromise(writeTextToClipboard(command)).catch(() => undefined);
      }}
      size="small"
    >
      <LucideMuiIcon icon={Copy} sx={{ fontSize: 14 }} />
    </IconButton>
  </Stack>
);

/** The one button that moves a provider forward from its current status (or `null` when nothing to do). */
export const ProviderPrimaryAction: FC<{ readonly provider: ProviderMock; readonly size?: 'medium' | 'small' }> = ({
  provider,
  size = 'small',
}) => {
  const store = useProvidersProto();
  const status = overallStatus(provider);
  const meta = PROVIDER_META[provider.id];
  switch (status) {
    case 'needs-runtime':
      return (
        <Button
          onClick={() => {
            store.installRuntime(provider.id);
          }}
          size={size}
          variant="contained"
        >
          {runtimeActionLabel(provider.id)}
        </Button>
      );
    case 'install-failed':
      return (
        <Button
          color="error"
          onClick={() => {
            store.installRuntime(provider.id);
          }}
          size={size}
          variant="outlined"
        >
          Retry
        </Button>
      );
    case 'not-signed-in':
      return meta.signIn._tag === 'InApp' ? (
        <Button
          onClick={() => {
            store.signIn(provider.id);
          }}
          size={size}
          variant="contained"
        >
          Sign in
        </Button>
      ) : (
        <Button
          onClick={() => {
            store.recheck(provider.id);
          }}
          size={size}
          variant="outlined"
        >
          Re-check
        </Button>
      );
    case 'unavailable':
      return (
        <Button
          onClick={() => {
            store.recheck(provider.id);
          }}
          size={size}
          variant="outlined"
        >
          Re-check
        </Button>
      );
    case 'installing':
    case 'checking':
    case 'signing-in':
      return <CircularProgress size={18} />;
    case 'disabled':
    case 'ready':
      return null;
  }
};

export const InstallProgress: FC<{ readonly provider: ProviderMock }> = ({ provider }) => {
  const job = provider.runtime?.job;
  if (job === undefined || (job._tag !== 'Installing' && job._tag !== 'Resolving')) {
    return null;
  }
  const meta = PROVIDER_META[provider.id];
  return (
    <Stack spacing={0.5} sx={{ minWidth: 200 }}>
      <LinearProgress
        value={job._tag === 'Installing' ? job.progress * 100 : 0}
        variant={job._tag === 'Installing' ? 'determinate' : 'indeterminate'}
      />
      <Typography color="text.secondary" sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.7rem' }} variant="caption">
        {job._tag === 'Resolving'
          ? meta.runtimeKind === 'npm'
            ? `npm view ${meta.runtimePackage ?? ''}@latest version`
            : 'Reading ACP registry antigravity-acp/agent.json'
          : meta.runtimeKind === 'npm'
            ? `npm install ${meta.runtimePackage ?? ''}@${job.version}`
            : `Downloading + verifying sha256 · v${job.version}`}
      </Typography>
    </Stack>
  );
};

/** "How to fix" body for whatever currently blocks the provider. Empty when ready. */
export const ProviderHelp: FC<{ readonly dense?: boolean; readonly provider: ProviderMock }> = ({
  dense,
  provider,
}) => {
  const status = overallStatus(provider);
  const meta = PROVIDER_META[provider.id];
  const gap = dense === true ? 0.75 : 1;

  if (status === 'unavailable') {
    return (
      <Stack spacing={gap}>
        <Typography color="text.secondary" variant="body2">
          <Box component="code" sx={{ fontFamily: FONT_FAMILY_MONO }}>
            {meta.cliName}
          </Box>{' '}
          was not found on your PATH. Install it, then Re-check.
        </Typography>
        {meta.cliInstall.map(hint => (
          <CommandSnippet command={hint.command} key={hint.label} label={hint.label} />
        ))}
      </Stack>
    );
  }
  if (status === 'install-failed' && provider.runtime?.job._tag === 'Failed') {
    const { detail, message } = provider.runtime.job;
    return (
      <Alert
        action={
          <IconButton
            aria-label="Copy error"
            onClick={() => {
              hostRunPromise(writeTextToClipboard(detail)).catch(() => undefined);
            }}
            size="small"
          >
            <LucideMuiIcon icon={Copy} sx={{ fontSize: 14 }} />
          </IconButton>
        }
        severity="error"
        variant="outlined"
      >
        {message}
        <Box
          component="pre"
          sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.7rem', m: 0, mt: 0.5, whiteSpace: 'pre-wrap' }}
        >
          {detail}
        </Box>
      </Alert>
    );
  }
  if (status === 'not-signed-in' || status === 'signing-in') {
    if (meta.signIn._tag === 'InApp') {
      return (
        <Typography color="text.secondary" variant="body2">
          {status === 'signing-in'
            ? 'Waiting for Google sign-in. A browser window should have opened.'
            : meta.signIn.hint}
        </Typography>
      );
    }
    return (
      <Stack spacing={gap}>
        <Typography color="text.secondary" variant="body2">
          {meta.signIn.hint} Then Re-check.
        </Typography>
        <CommandSnippet command={meta.signIn.command} />
      </Stack>
    );
  }
  if (status === 'needs-runtime') {
    return (
      <Typography color="text.secondary" variant="body2">
        {meta.runtimeKind === 'npm'
          ? `Downloads ${meta.runtimePackage ?? ''} (latest) with npm into ~/.ao/providers/${provider.id}/runtime/.`
          : `Installs agy_acp_server (latest from the ACP registry, sha256-verified) into ~/.ao/providers/${provider.id}/runtime/.`}
      </Typography>
    );
  }
  return null;
};

/** Relative "Checked just now" label, re-rendered every 10s. */
export const useCheckedLabel = (checkedAt: number): string => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => {
      setNow(Date.now());
    }, 10_000);
    return () => {
      clearInterval(handle);
    };
  }, []);
  const seconds = Math.max(0, Math.round((now - checkedAt) / 1000));
  if (seconds < 10) {
    return 'Checked just now';
  }
  if (seconds < 60) {
    return `Checked ${seconds}s ago`;
  }
  return `Checked ${Math.round(seconds / 60)}m ago`;
};

// --- Modals -----------------------------------------------------------------

/** Startup Providers modal chrome; each variant supplies the body from its own Settings components. */
export const ProvidersStartupDialog: FC<{
  readonly children: ReactNode;
  readonly maxWidth?: 'md' | 'sm';
  readonly onClose: () => void;
  readonly open: boolean;
}> = ({ children, maxWidth = 'sm', onClose, open }) => {
  const store = useProvidersProto();
  const enabled = store.providers.filter(p => p.enabled);
  const ready = enabled.filter(p => overallStatus(p) === 'ready').length;
  return (
    <Dialog fullWidth maxWidth={maxWidth} onClose={onClose} open={open}>
      <DialogTitle sx={{ pb: 0.5 }}>Providers</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }} variant="body2">
          {enabled.length === 0
            ? 'No providers enabled. '
            : `${ready} of ${enabled.length} enabled ${enabled.length === 1 ? 'provider' : 'providers'} ready. `}
          Turn on the agents you want to use and set them up — you can change this later in Settings → Providers.
        </Typography>
        {children}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', pb: 2, px: 3 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={!store.showOnStartup}
              onChange={(_event, checked) => {
                store.setShowOnStartup(!checked);
              }}
              size="small"
            />
          }
          label={<Typography variant="body2">Don&apos;t show me again</Typography>}
        />
        <Button onClick={onClose} variant="contained">
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
};

type NodeCheck = 'checking' | 'missing';

/** Blocking Node ≥ 22 / npm prerequisite modal. Single design shared by every variant. */
export const NodePrerequisiteDialog: FC<{ readonly onResolved: () => void; readonly open: boolean }> = ({
  onResolved,
  open,
}) => {
  const [check, setCheck] = useState<NodeCheck>('missing');
  const [attempts, setAttempts] = useState(0);

  const retry = (): void => {
    setCheck('checking');
    setTimeout(() => {
      // First Retry still fails (user hasn't upgraded yet); second one passes.
      if (attempts === 0) {
        setAttempts(1);
        setCheck('missing');
        return;
      }
      setCheck('missing');
      setAttempts(0);
      onResolved();
    }, 900);
  };

  return (
    <Dialog fullWidth maxWidth="xs" open={open}>
      <DialogTitle>Node.js required</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2">
            This application requires Node &gt;= 22 and npm to be installed. They are used to download and run provider
            runtimes.
          </Typography>
          <Box
            sx={{
              display: 'grid',
              fontFamily: FONT_FAMILY_MONO,
              fontSize: '0.75rem',
              gap: 0.5,
              gridTemplateColumns: 'auto 1fr',
            }}
          >
            <span>node</span>
            <Box component="span" sx={{ color: 'error.main' }}>
              v20.11.0 — needs ≥ 22
            </Box>
            <span>npm</span>
            <Box component="span" sx={{ color: 'success.main' }}>
              10.2.4
            </Box>
          </Box>
          {attempts > 0 && check === 'missing' ? (
            <Alert severity="warning" variant="outlined">
              Still v20.11.0. If you just installed Node, restart the app so it picks up your new PATH.
            </Alert>
          ) : null}
          <Typography color="text.secondary" variant="caption">
            nodejs.org/en/download
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ pb: 2, px: 3 }}>
        <Button
          onClick={() => {
            openExternal('https://nodejs.org/en/download');
          }}
          variant="outlined"
        >
          Download Node.js
        </Button>
        <Button disabled={check === 'checking'} onClick={retry} variant="contained">
          {check === 'checking' ? 'Checking…' : 'Retry'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
