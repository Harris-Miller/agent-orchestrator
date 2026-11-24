/** PROTOTYPE (#457): C, state-driven icon (spin / pulse / warn); popover has App | Providers tabs of release cards. */
import { AgentLaunchTargetIcon, LucideMuiIcon } from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { CircleArrowUp, CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { download, install, isBusy, pending } from './store.ts';
import type { UpdateItem } from './store.ts';

const Card: FC<{ readonly item: UpdateItem }> = ({ item }) => (
  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
      {item.icon === undefined ? null : <AgentLaunchTargetIcon launchTarget={item.icon} size={18} />}
      <Typography sx={{ flex: 1, fontWeight: 600 }}>{item.label}</Typography>
      <Typography sx={{ color: 'text.secondary', fontFamily: 'monospace' }} variant="caption">
        {item.from}
      </Typography>
      <Typography variant="caption">→</Typography>
      <Typography sx={{ color: 'success.main', fontFamily: 'monospace', fontWeight: 700 }} variant="caption">
        {item.to}
      </Typography>
    </Stack>
    <Typography sx={{ color: 'text.secondary', my: 1 }} variant="body2">
      {item.notes}
    </Typography>
    {item.sessions > 0 && item.phase === 'ready' ? (
      <Typography sx={{ color: 'warning.main', mb: 1 }} variant="caption">
        Installing closes {item.sessions} open sessions.
      </Typography>
    ) : null}
    {isBusy(item) ? (
      <Box>
        <LinearProgress sx={{ borderRadius: 1 }} />
        <Typography sx={{ color: 'text.secondary' }} variant="caption">
          {item.phase === 'downloading' ? 'Downloading…' : 'Installing…'}
        </Typography>
      </Box>
    ) : item.phase === 'available' ? (
      <Button
        onClick={() => {
          download(item.id);
        }}
        size="small"
        variant="outlined"
      >
        Download
      </Button>
    ) : (
      <Button
        onClick={() => {
          install(item.id);
        }}
        size="small"
        variant="contained"
      >
        {item.kind === 'app' ? 'Restart to update' : 'Install'}
      </Button>
    )}
  </Box>
);

export const VariantC: FC<{
  readonly checkFailed: boolean;
  readonly items: readonly UpdateItem[];
  readonly onOpenProviders: () => void;
}> = ({ checkFailed, items, onOpenProviders }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState<'app' | 'provider'>('provider');
  const todo = pending(items);
  const has = todo.length > 0;
  const busy = items.some(isBusy);
  const appItems = todo.filter(item => item.kind === 'app');
  const providerItems = todo.filter(item => item.kind === 'provider');
  const shown = tab === 'app' ? appItems : providerItems;

  const icon = busy ? RefreshCw : checkFailed ? TriangleAlert : has ? CircleArrowUp : CircleCheck;
  const color = busy ? 'info.main' : checkFailed ? 'warning.main' : has ? 'primary.main' : 'text.disabled';
  return (
    <>
      <Tooltip
        title={busy ? 'Updating…' : checkFailed ? 'Update check failed' : has ? 'Updates available' : 'Up to date'}
      >
        <IconButton
          aria-label="Updates"
          onClick={(event: MouseEvent<HTMLElement>) => {
            setAnchor(event.currentTarget);
          }}
          size="small"
          sx={{
            '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
            '@keyframes pulse': {
              '0%': { boxShadow: '0 0 0 0 rgba(120,120,255,.6)' },
              '100%': { boxShadow: '0 0 0 10px rgba(120,120,255,0)' },
            },
            animation: has && !busy && !checkFailed ? 'pulse 1.8s infinite' : undefined,
            '& svg': { animation: busy ? 'spin 1.2s linear infinite' : undefined },
          }}
        >
          <LucideMuiIcon fontSize="small" icon={icon} sx={{ color }} />
        </IconButton>
      </Tooltip>
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
        onClose={() => {
          setAnchor(null);
        }}
        open={anchor !== null}
        slotProps={{ paper: { sx: { mb: 1, width: 380 } } }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        <Tabs
          onChange={(_event, value: 'app' | 'provider') => {
            setTab(value);
          }}
          value={tab}
          variant="fullWidth"
        >
          <Tab label={`App${appItems.length > 0 ? ` (${appItems.length})` : ''}`} value="app" />
          <Tab label={`Providers${providerItems.length > 0 ? ` (${providerItems.length})` : ''}`} value="provider" />
        </Tabs>
        <Stack sx={{ gap: 1, p: 1.5 }}>
          {checkFailed ? (
            <Typography sx={{ color: 'warning.main' }} variant="body2">
              Could not check for the latest Claude version (network unreachable).
            </Typography>
          ) : null}
          {shown.length > 0 ? (
            shown.map(item => <Card item={item} key={item.id} />)
          ) : (
            <Typography sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }} variant="body2">
              {tab === 'app' ? 'HOA is up to date (v0.1.0).' : 'All Providers are up to date.'}
            </Typography>
          )}
        </Stack>
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            borderTop: 1,
            borderColor: 'divider',
            justifyContent: 'space-between',
            px: 1.5,
            py: 0.5,
          }}
        >
          <Typography sx={{ color: 'text.secondary' }} variant="caption">
            Checked 3 min ago
          </Typography>
          <Box>
            <Button size="small">Check now</Button>
            <Button
              onClick={() => {
                setAnchor(null);
                onOpenProviders();
              }}
              size="small"
            >
              Settings
            </Button>
          </Box>
        </Stack>
      </Popover>
    </>
  );
};
