/** PROTOTYPE (#457): B, labelled pill (icon-only when `compact`); popover is a summary with one bulk "Update all". */
import { LucideMuiIcon } from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChevronDown, CircleArrowUp, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { isBusy, itemVersion, pending, updateAll } from './store.ts';
import type { UpdateItem } from './store.ts';

const STEPS_DONE: Readonly<Record<UpdateItem['phase'], number>> = {
  available: 0,
  done: 2,
  downloading: 0.5,
  installing: 1.5,
  ready: 1,
};

/** Fraction of the update pipeline (download + install per item = 2 steps) that is done. */
const progress = (items: readonly UpdateItem[]): number =>
  items.length === 0 ? 0 : (items.reduce((sum, item) => sum + STEPS_DONE[item.phase], 0) / (items.length * 2)) * 100;

export const VariantB: FC<{
  readonly checkFailed: boolean;
  readonly compact: boolean;
  readonly items: readonly UpdateItem[];
  readonly onOpenProviders: () => void;
}> = ({ checkFailed, compact, items, onOpenProviders }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const todo = pending(items);
  const has = todo.length > 0;
  const busy = items.some(isBusy);
  const open = (event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget);
  };
  return (
    <>
      {compact ? (
        <IconButton
          aria-label="Updates"
          onClick={open}
          size="small"
          sx={{
            bgcolor: has ? 'primary.main' : 'transparent',
            color: has ? 'primary.contrastText' : 'text.disabled',
            '&:hover': { bgcolor: has ? 'primary.dark' : undefined },
          }}
        >
          <LucideMuiIcon fontSize="small" icon={has ? CircleArrowUp : CircleCheck} />
        </IconButton>
      ) : (
        <Chip
          clickable
          color={has ? 'primary' : 'default'}
          icon={<LucideMuiIcon icon={has ? CircleArrowUp : CircleCheck} />}
          label={has ? `${todo.length} update${todo.length === 1 ? '' : 's'}` : 'Up to date'}
          onClick={open}
          size="small"
          variant={has ? 'filled' : 'outlined'}
        />
      )}
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
        onClose={() => {
          setAnchor(null);
        }}
        open={anchor !== null}
        slotProps={{ paper: { sx: { mb: 1, p: 2, width: 320 } } }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        <Typography sx={{ fontWeight: 700 }} variant="h6">
          {has ? `${todo.length} update${todo.length === 1 ? '' : 's'} available` : "You're up to date"}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 1.5 }} variant="body2">
          {checkFailed
            ? 'Could not check for the latest Claude version.'
            : has
              ? todo.map(item => item.label).join(', ')
              : 'Last checked 3 minutes ago.'}
        </Typography>
        {has ? (
          <>
            {busy ? (
              <LinearProgress
                sx={{ borderRadius: 1, height: 6, mb: 1.5 }}
                value={progress(items)}
                variant="determinate"
              />
            ) : null}
            <Button disabled={busy} fullWidth onClick={updateAll} variant="contained">
              {busy ? 'Updating…' : 'Update all'}
            </Button>
            <Button
              endIcon={
                <LucideMuiIcon icon={ChevronDown} sx={{ transform: showDetails ? 'rotate(180deg)' : undefined }} />
              }
              onClick={() => {
                setShowDetails(value => !value);
              }}
              size="small"
              sx={{ mt: 1 }}
            >
              Details
            </Button>
            <Collapse in={showDetails}>
              <Stack sx={{ gap: 0.75, pt: 0.5 }}>
                {todo.map(item => (
                  <Stack direction="row" key={item.id} sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="body2">{item.label}</Typography>
                    <Box sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: 12 }}>
                      {itemVersion(item)}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Collapse>
          </>
        ) : null}
        <Button
          onClick={() => {
            setAnchor(null);
            onOpenProviders();
          }}
          size="small"
          sx={{ mt: 1.5, ml: -1 }}
        >
          Open Providers settings
        </Button>
      </Popover>
    </>
  );
};
