/** Updates indicator: icon button beside the Settings gear; popover lists pending Provider/App updates with actions. */
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { CircleArrowUp, CircleCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { PROVIDER_META } from '../../host/providerView.ts';
import { isBusyPhase, updateRows, updatesSummary } from '../../host/updatesView.ts';
import type { AppUpdateView, UpdatePhase, UpdateRow } from '../../host/updatesView.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';
import { useProviderControls } from '../providers/providerUi.tsx';
import { useCheckProviderUpdates } from '../providers/useCheckProviderUpdates.ts';
import type { ProviderRequest } from '../providers/providerUi.tsx';

/** Desktop-only: the App update state and its actions. Omitted in VS Code. */
export type AppUpdateControls = {
  readonly onCheck: () => void;
  readonly onDownload: () => void;
  readonly onInstall: () => void;
  /** Re-run a failed App update (check, then download). */
  readonly onRetry: () => void;
  readonly state: AppUpdateView;
};

const BusyLabel: FC<{ readonly phase: UpdatePhase; readonly version: string | undefined }> = ({ phase, version }) => (
  <Stack direction="row" sx={{ alignItems: 'center', color: 'text.secondary', gap: 1 }}>
    <CircularProgress size={14} />
    <Typography variant="caption">
      {phase === 'downloading' ? 'Downloading' : 'Installing'}
      {version === undefined ? '' : ` v${version}`}…
    </Typography>
  </Stack>
);

/** The one button a row offers: its label and what it does. */
const rowAction = (
  row: UpdateRow,
  app: AppUpdateControls | undefined,
  request: ProviderRequest,
): { readonly label: string; readonly run: () => void } => {
  const ready = row.phase === 'ready';
  if (row.kind === 'provider') {
    return ready
      ? {
          label: `Install v${row.version}`,
          run: () => {
            request({ kind: 'install' }, row.id);
          },
        }
      : {
          label: `Download v${row.version}`,
          run: () => {
            request({ kind: 'download' }, row.id);
          },
        };
  }
  if (row.phase === 'failed') {
    return { label: 'Retry', run: () => app?.onRetry() };
  }
  return ready
    ? { label: 'Restart', run: () => app?.onInstall() }
    : { label: `Download v${row.version}`, run: () => app?.onDownload() };
};

const Row: FC<{
  readonly app: AppUpdateControls | undefined;
  readonly request: ProviderRequest;
  readonly row: UpdateRow;
}> = ({ app, request, row }) => {
  const { label, run } = rowAction(row, app, request);
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
      <Box sx={{ width: 20 }}>
        {row.kind === 'provider' ? (
          <AgentLaunchTargetIcon launchTarget={row.id} size={20} />
        ) : (
          <LucideMuiIcon fontSize="small" icon={CircleArrowUp} sx={{ color: 'primary.main' }} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }} variant="body2">
          {row.kind === 'provider' ? PROVIDER_META[row.id].label : 'HOA (app)'}
        </Typography>
        {row.error === undefined ? null : (
          <Typography sx={{ color: 'warning.main', display: 'block' }} variant="caption">
            {row.kind === 'app' ? 'Update failed: ' : ''}
            {row.error}
          </Typography>
        )}
        {row.version === undefined ? null : (
          <Typography sx={{ color: 'text.secondary' }} variant="caption">
            {row.kind === 'provider' && row.from !== undefined ? `v${row.from} → v${row.version}` : `v${row.version}`}
          </Typography>
        )}
      </Box>
      {isBusyPhase(row.phase) ? (
        <BusyLabel phase={row.phase} version={row.version} />
      ) : (
        <Button onClick={run} size="small" variant={row.phase === 'ready' ? 'contained' : 'outlined'}>
          {label}
        </Button>
      )}
    </Stack>
  );
};

export const UpdatesIndicator: FC<{
  readonly app?: AppUpdateControls;
  readonly onOpenProviders: () => void;
}> = ({ app, onOpenProviders }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { dialog, providers, request } = useProviderControls();
  const checkProviders = useCheckProviderUpdates();
  const rows = updateRows(providers, app?.state);
  const { appFailed, count, failedProviders } = updatesSummary(rows, providers);
  const hasUpdates = count > 0;
  const warn = !hasUpdates && (appFailed || failedProviders.length > 0);
  const checking = app?.state._tag === 'Checking' || providers.some(p => p.runtime?.latest._tag === 'Checking');
  let tooltip = 'Up to date';
  if (hasUpdates) {
    tooltip = `${count} ${count === 1 ? 'update' : 'updates'} available`;
  } else if (appFailed) {
    tooltip = 'Update failed';
  } else if (failedProviders.length > 0) {
    tooltip = 'Update check failed';
  }

  const checkAll = () => {
    checkProviders().catch(() => undefined);
    app?.onCheck();
  };

  return (
    <>
      <Tooltip title={tooltip}>
        <IconButton
          aria-label="Updates"
          onClick={(event: MouseEvent<HTMLElement>) => {
            setAnchor(event.currentTarget);
          }}
          size="small"
        >
          <Badge
            badgeContent={warn ? '!' : count}
            color={warn ? 'warning' : 'primary'}
            invisible={!hasUpdates && !warn}
          >
            <LucideMuiIcon
              fontSize="small"
              icon={hasUpdates ? CircleArrowUp : CircleCheck}
              sx={{ color: hasUpdates ? 'primary.main' : 'text.disabled' }}
            />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
        onClose={() => {
          setAnchor(null);
        }}
        open={anchor !== null}
        slotProps={{ paper: { sx: { mb: 1, width: 340 } } }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25 }}>
          <Typography sx={{ fontWeight: 700 }}>Updates</Typography>
          <Tooltip title="Check for updates">
            <IconButton aria-label="Check for updates" disabled={checking} onClick={checkAll} size="small">
              <LucideMuiIcon
                fontSize="small"
                icon={RefreshCw}
                sx={
                  checking
                    ? {
                        '@keyframes updates-spin': { to: { transform: 'rotate(360deg)' } },
                        animation: 'updates-spin 1s linear infinite',
                      }
                    : undefined
                }
              />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider />
        {failedProviders.map(p => (
          <Typography key={p.id} sx={{ color: 'warning.main', px: 2, pt: 1.25 }} variant="body2">
            Could not check for the latest {PROVIDER_META[p.id].label} version.
          </Typography>
        ))}
        {rows.length > 0 ? (
          rows.map(row => <Row app={app} key={row.kind === 'app' ? 'app' : row.id} request={request} row={row} />)
        ) : (
          <Typography sx={{ color: 'text.secondary', px: 2, py: 2 }} variant="body2">
            Everything is up to date.
          </Typography>
        )}
        <Divider />
        <Box sx={{ p: 0.5 }}>
          <Button
            onClick={() => {
              setAnchor(null);
              onOpenProviders();
            }}
            size="small"
            sx={{ justifyContent: 'flex-start' }}
          >
            Open Providers settings
          </Button>
        </Box>
      </Popover>
      {dialog}
    </>
  );
};
