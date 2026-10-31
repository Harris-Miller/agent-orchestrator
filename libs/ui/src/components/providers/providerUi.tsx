/** Shared presentation for Settings > Providers and the startup modal: status dot, command snippet, copy, actions. */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { PROVIDER_RUNTIME_DIRNAME, providerDisplayPath } from '@lib/ao-home';
import { OpenUrl } from '@lib/context-services';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Effect } from 'effect';
import { Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import {
  checkLatestAtomFn,
  downloadAtomFn,
  installAtomFn,
  providerViewsAtom,
  recheckAtomFn,
  refreshProviderAtomFn,
  removeAtomFn,
  setProviderEnabledAtomFn,
  signInAntigravityAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { overallStatus, PROVIDER_META, STATUS_META } from '../../host/providerView.ts';
import type { ProviderView, StatusTone } from '../../host/providerView.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

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

export const StatusDot: FC<{ readonly provider: ProviderView; readonly size?: number }> = ({ provider, size = 8 }) => {
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
    sx={{ alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1, gap: 1, pl: 1.25, pr: 0.5, py: 0.25 }}
  >
    {label === undefined ? null : (
      <Typography color="text.secondary" sx={{ flexShrink: 0, minWidth: 96 }} variant="caption">
        {label}
      </Typography>
    )}
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

/** "How to fix" body for whatever currently blocks the provider. Empty when ready. */
export const ProviderHelp: FC<{ readonly dense?: boolean; readonly provider: ProviderView }> = ({
  dense,
  provider,
}) => {
  const status = overallStatus(provider);
  const meta = PROVIDER_META[provider.id];
  const gap = dense === true ? 0.75 : 1;

  if (status === 'cli-missing') {
    return (
      <Stack spacing={gap}>
        <Typography color="text.secondary" variant="body2">
          <Box component="code" sx={{ fontFamily: FONT_FAMILY_MONO }}>
            {meta.cliName}
          </Box>{' '}
          was not found on your PATH. Install it, then Recheck.
        </Typography>
        {meta.cliInstall.map(hint => (
          <CommandSnippet command={hint.command} key={hint.label} label={hint.label} />
        ))}
      </Stack>
    );
  }
  if (status === 'download-failed' && provider.runtime?.job._tag === 'Failed') {
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
  if (status === 'error') {
    return <Alert severity="error">{provider.harnessError}</Alert>;
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
          {meta.signIn.hint} Then Recheck.
        </Typography>
        <CommandSnippet command={meta.signIn.command} />
      </Stack>
    );
  }
  if (status === 'needs-runtime') {
    return (
      <Typography color="text.secondary" variant="body2">
        {meta.runtime?._tag === 'npm'
          ? `Downloads ${meta.runtime.package} (latest) with npm into ${providerDisplayPath(provider.id, PROVIDER_RUNTIME_DIRNAME)}/.`
          : `Downloads agy_acp_server (latest from the ACP registry, sha256-verified) into ${providerDisplayPath(provider.id, PROVIDER_RUNTIME_DIRNAME)}/.`}
      </Typography>
    );
  }
  return null;
};

// --- Actions with the destructive-action warning ------------------------------------------

export type ProviderAction =
  | { readonly kind: 'checkLatest' | 'download' | 'enable' }
  | { readonly kind: 'disable' | 'install' | 'recheck' | 'remove' | 'signIn' };

const DISRUPTIVE: ReadonlySet<ProviderAction['kind']> = new Set(['disable', 'install', 'recheck', 'remove', 'signIn']);

const ACTION_LABEL: Readonly<Record<ProviderAction['kind'], string>> = {
  checkLatest: 'Check for latest',
  disable: 'Disable',
  download: 'Download',
  enable: 'Enable',
  install: 'Install',
  recheck: 'Recheck',
  remove: 'Remove',
  signIn: 'Sign in',
};

type Pending = { readonly action: ProviderAction; readonly launchTarget: AgentLaunchTarget; readonly sessions: number };

/**
 * Wires provider actions to atoms. Disable, Remove, Install, Recheck and Sign in close this instance's live sessions
 * for that provider, so they ask first (Cancel / Continue) when there are any. Download and Check for latest never do.
 * Render `dialog` once next to the controls.
 */
export const useProviderControls = () => {
  const providers = useAtomValue(providerViewsAtom);
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const refresh = useAtomSet(refreshProviderAtomFn, { mode: 'promise' });
  const checkLatest = useAtomSet(checkLatestAtomFn, { mode: 'promise' });
  const download = useAtomSet(downloadAtomFn, { mode: 'promise' });
  const install = useAtomSet(installAtomFn, { mode: 'promise' });
  const remove = useAtomSet(removeAtomFn, { mode: 'promise' });
  const recheck = useAtomSet(recheckAtomFn, { mode: 'promise' });
  const setEnabled = useAtomSet(setProviderEnabledAtomFn, { mode: 'promise' });
  const signIn = useAtomSet(signInAntigravityAtomFn, { mode: 'promise' });

  useEffect(() => {
    refresh(undefined).catch(() => undefined);
  }, [refresh]);

  const perform = useCallback(
    (action: ProviderAction, launchTarget: AgentLaunchTarget) => {
      const run = (): Promise<unknown> => {
        switch (action.kind) {
          case 'checkLatest':
            return checkLatest(launchTarget);
          case 'disable':
            return setEnabled({ enabled: false, launchTarget });
          case 'download':
            return download(launchTarget);
          case 'enable':
            return setEnabled({ enabled: true, launchTarget });
          case 'install':
            return install(launchTarget);
          case 'recheck':
            return recheck(launchTarget);
          case 'remove':
            return remove(launchTarget);
          case 'signIn':
            return signIn(undefined);
        }
      };
      run().catch(() => undefined);
    },
    [checkLatest, download, install, recheck, remove, setEnabled, signIn],
  );

  const request = useCallback(
    (action: ProviderAction, launchTarget: AgentLaunchTarget) => {
      const sessions = providers.find(provider => provider.id === launchTarget)?.liveSessions ?? 0;
      if (DISRUPTIVE.has(action.kind) && sessions > 0) {
        setPending({ action, launchTarget, sessions });
        return;
      }
      perform(action, launchTarget);
    },
    [perform, providers],
  );

  const dialog: ReactNode =
    pending === undefined ? null : (
      <Dialog
        onClose={() => {
          setPending(undefined);
        }}
        open
      >
        <DialogTitle>
          {ACTION_LABEL[pending.action.kind]} {PROVIDER_META[pending.launchTarget].label}?
        </DialogTitle>
        <DialogContent>
          <Typography>
            This will close {pending.sessions} open {pending.sessions === 1 ? 'session' : 'sessions'} in this window.
            Sessions are not reopened automatically; your history stays.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setPending(undefined);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              perform(pending.action, pending.launchTarget);
              setPending(undefined);
            }}
            variant="contained"
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    );

  return { dialog, providers, request };
};

export type ProviderRequest = ReturnType<typeof useProviderControls>['request'];

export const ProviderEnabledSwitch: FC<{
  readonly provider: ProviderView;
  readonly request: ProviderRequest;
}> = ({ provider, request }) => (
  <Switch
    checked={provider.enabled}
    onChange={(_event, checked) => {
      request({ kind: checked ? 'enable' : 'disable' }, provider.id);
    }}
    onClick={event => {
      event.stopPropagation();
    }}
    slotProps={{ input: { 'aria-label': `Enable ${PROVIDER_META[provider.id].label}` } }}
  />
);

/** The one button that moves a provider forward from its current status (or `null` when nothing to do). */
export const ProviderPrimaryAction: FC<{
  readonly provider: ProviderView;
  readonly request: ProviderRequest;
  readonly size?: 'medium' | 'small';
}> = ({ provider, request, size = 'small' }) => {
  const meta = PROVIDER_META[provider.id];
  switch (overallStatus(provider)) {
    case 'needs-runtime':
      return (
        <Button
          onClick={() => {
            request({ kind: 'download' }, provider.id);
          }}
          size={size}
          variant="contained"
        >
          Download
        </Button>
      );
    case 'download-failed':
      return (
        <Button
          color="error"
          onClick={() => {
            request({ kind: 'download' }, provider.id);
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
            request({ kind: 'signIn' }, provider.id);
          }}
          size={size}
          variant="contained"
        >
          Sign in
        </Button>
      ) : (
        <Button
          onClick={() => {
            request({ kind: 'recheck' }, provider.id);
          }}
          size={size}
          variant="outlined"
        >
          Recheck
        </Button>
      );
    case 'cli-missing':
    case 'error':
      return (
        <Button
          onClick={() => {
            request({ kind: 'recheck' }, provider.id);
          }}
          size={size}
          variant="outlined"
        >
          Recheck
        </Button>
      );
    case 'downloading':
    case 'switching':
    case 'checking':
    case 'signing-in':
      return <CircularProgress size={18} />;
    case 'disabled':
    case 'ready':
      return null;
  }
};
