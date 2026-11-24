/** Updates indicator: icon button beside the Settings gear; popover lists pending Provider/App updates with actions. */
import { RegistryContext } from '@effect/atom-react';
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
import { useContext, useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { checkLatestAtomFn, providerViewsAtom } from '../../atoms/boundHarnessAtoms.ts';
import { PROVIDER_META, providersToCheckForUpdates } from '../../host/providerView.ts';
import { updateRows, updatesSummary } from '../../host/updatesView.ts';
import type { AppUpdateView, UpdateRow } from '../../host/updatesView.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';
import { useProviderControls } from '../providers/providerUi.tsx';
import type { ProviderRequest } from '../providers/providerUi.tsx';

/** Desktop-only: the App update state and its actions. Omitted in VS Code. */
export type AppUpdateControls = {
  readonly onCheck: () => void;
  readonly onDownload: () => void;
  readonly onInstall: () => void;
  readonly state: AppUpdateView;
};

const BusyLabel: FC<{ readonly phase: UpdateRow['phase'] }> = ({ phase }) => (
  <Stack direction="row" sx={{ alignItems: 'center', color: 'text.secondary', gap: 1 }}>
    <CircularProgress size={14} />
    <Typography variant="caption">{phase === 'downloading' ? 'Downloading…' : 'Installing…'}</Typography>
  </Stack>
);

const Row: FC<{
  readonly app: AppUpdateControls | undefined;
  readonly request: ProviderRequest;
  readonly row: UpdateRow;
}> = ({ app, request, row }) => {
  const busy = row.phase === 'downloading' || row.phase === 'installing';
  const act = () => {
    if (row.kind === 'provider') {
      request({ kind: row.phase === 'ready' ? 'install' : 'download' }, row.id);
    } else if (row.phase === 'ready') {
      app?.onInstall();
    } else {
      app?.onDownload();
    }
  };
  const label = row.phase === 'ready' ? (row.kind === 'app' ? 'Restart' : 'Install') : `Download v${row.version}`;
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
        <Typography sx={{ color: 'text.secondary' }} variant="caption">
          {row.kind === 'provider' && row.from !== undefined ? `v${row.from} → v${row.version}` : `v${row.version}`}
        </Typography>
      </Box>
      {busy ? (
        <BusyLabel phase={row.phase} />
      ) : (
        <Button onClick={act} size="small" variant={row.phase === 'ready' ? 'contained' : 'outlined'}>
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
  const registry = useContext(RegistryContext);
  const rows = updateRows(providers, app?.state);
  const { checkFailed, count } = updatesSummary(rows, providers);
  const has = count > 0;
  const failedLabels = providers
    .filter(p => p.enabled && p.runtime?.latest._tag === 'Failed')
    .map(p => PROVIDER_META[p.id].label);

  const checkAll = () => {
    for (const id of providersToCheckForUpdates(registry.get(providerViewsAtom))) {
      registry.set(checkLatestAtomFn(id), id);
    }
    app?.onCheck();
  };

  return (
    <>
      <Tooltip title={has ? `${count} ${count === 1 ? 'update' : 'updates'} available` : 'Up to date'}>
        <IconButton
          aria-label="Updates"
          onClick={(event: MouseEvent<HTMLElement>) => {
            setAnchor(event.currentTarget);
          }}
          size="small"
        >
          <Badge
            badgeContent={checkFailed && !has ? '!' : count}
            color={checkFailed && !has ? 'warning' : 'primary'}
            invisible={!has && !checkFailed}
          >
            <LucideMuiIcon
              fontSize="small"
              icon={has ? CircleArrowUp : CircleCheck}
              sx={{ color: has ? 'primary.main' : 'text.disabled' }}
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
            <IconButton aria-label="Check for updates" onClick={checkAll} size="small">
              <LucideMuiIcon fontSize="small" icon={RefreshCw} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider />
        {failedLabels.map(label => (
          <Typography key={label} sx={{ color: 'warning.main', px: 2, pt: 1.25 }} variant="body2">
            Could not check for the latest {label} version.
          </Typography>
        ))}
        {has ? (
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
