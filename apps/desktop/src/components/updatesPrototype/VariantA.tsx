/** PROTOTYPE (#457): A, icon + count badge; popover is a flat list, one action button per row. */
import { AgentLaunchTargetIcon, LucideMuiIcon } from '@lib/ui';
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

import { download, install, isBusy, itemVersion, pending } from './store.ts';
import type { UpdateItem } from './store.ts';

const Row: FC<{ readonly item: UpdateItem }> = ({ item }) => (
  <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
    <Box sx={{ width: 20 }}>
      {item.icon === undefined ? (
        <LucideMuiIcon fontSize="small" icon={CircleArrowUp} sx={{ color: 'primary.main' }} />
      ) : (
        <AgentLaunchTargetIcon launchTarget={item.icon} size={20} />
      )}
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }} variant="body2">
        {item.label}
        {item.kind === 'app' ? ' (app)' : ''}
      </Typography>
      <Typography sx={{ color: 'text.secondary' }} variant="caption">
        {itemVersion(item)}
      </Typography>
    </Box>
    {isBusy(item) ? (
      <Stack direction="row" sx={{ alignItems: 'center', color: 'text.secondary', gap: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption">{item.phase === 'downloading' ? 'Downloading…' : 'Installing…'}</Typography>
      </Stack>
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
        {item.kind === 'app' ? 'Restart' : 'Install'}
      </Button>
    )}
  </Stack>
);

export const VariantA: FC<{
  readonly checkFailed: boolean;
  readonly items: readonly UpdateItem[];
  readonly onOpenProviders: () => void;
}> = ({ checkFailed, items, onOpenProviders }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const todo = pending(items);
  const has = todo.length > 0;
  return (
    <>
      <Tooltip title={has ? `${todo.length} updates available` : 'Up to date'}>
        <IconButton
          aria-label="Updates"
          onClick={(event: MouseEvent<HTMLElement>) => {
            setAnchor(event.currentTarget);
          }}
          size="small"
        >
          <Badge
            badgeContent={checkFailed ? '!' : todo.length}
            color={checkFailed ? 'warning' : 'primary'}
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
            <IconButton aria-label="Check for updates" size="small">
              <LucideMuiIcon fontSize="small" icon={RefreshCw} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider />
        {checkFailed ? (
          <Typography sx={{ color: 'warning.main', px: 2, pt: 1.25 }} variant="body2">
            Could not check for the latest Claude version.
          </Typography>
        ) : null}
        {has ? (
          todo.map(item => <Row item={item} key={item.id} />)
        ) : (
          <Typography sx={{ color: 'text.secondary', px: 2, py: 2 }} variant="body2">
            Everything is up to date. Last checked 3 minutes ago.
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
    </>
  );
};
