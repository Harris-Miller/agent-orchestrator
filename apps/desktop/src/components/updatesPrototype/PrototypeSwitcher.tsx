/** PROTOTYPE (#457, throwaway): bottom bar to flip variants and mock scenarios. DEV only. */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { LucideMuiIcon } from '@lib/ui';

import { cancelInstall, confirmInstall, SCENARIOS, setScenario, setVariant, useProtoState, VARIANTS } from './store.ts';

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    'input, textarea, select, [contenteditable], [contenteditable="true"], [role="combobox"], [role="tab"], [role="menuitem"], [role="option"]',
  ) !== null;

export const PrototypeSwitcher: FC = () => {
  const { confirm, items, scenario, variant } = useProtoState();
  const index = VARIANTS.findIndex(v => v.key === variant);
  const cycle = (delta: number) => {
    setVariant(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]?.key ?? 'A');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  if (!import.meta.env.DEV) return null;

  const confirming = items.find(item => item.id === confirm);
  return (
    <>
      <Box
        sx={{
          alignItems: 'center',
          bgcolor: '#111',
          border: '1px solid #444',
          borderRadius: 99,
          bottom: 16,
          boxShadow: 6,
          color: '#fff',
          display: 'flex',
          gap: 0.5,
          left: '50%',
          px: 1,
          py: 0.5,
          position: 'fixed',
          transform: 'translateX(-50%)',
          zIndex: 2000,
        }}
      >
        <IconButton
          aria-label="Previous variant"
          onClick={() => {
            cycle(-1);
          }}
          size="small"
          sx={{ color: 'inherit' }}
        >
          <LucideMuiIcon fontSize="small" icon={ChevronLeft} />
        </IconButton>
        <Typography sx={{ minWidth: 190, textAlign: 'center' }} variant="body2">
          {variant} ({VARIANTS[index]?.name})
        </Typography>
        <IconButton
          aria-label="Next variant"
          onClick={() => {
            cycle(1);
          }}
          size="small"
          sx={{ color: 'inherit' }}
        >
          <LucideMuiIcon fontSize="small" icon={ChevronRight} />
        </IconButton>
        <Typography sx={{ color: '#888', mx: 0.5 }} variant="body2">
          |
        </Typography>
        <Select
          MenuProps={{ sx: { zIndex: 2100 } }}
          onChange={event => {
            setScenario(event.target.value);
          }}
          size="small"
          sx={{ color: '#fff', fontSize: 13, '.MuiSelect-select': { py: 0.25 }, '& fieldset': { border: 0 } }}
          value={scenario}
        >
          {SCENARIOS.map(s => (
            <MenuItem key={s.key} value={s.key}>
              {s.label}
            </MenuItem>
          ))}
        </Select>
      </Box>
      <Dialog onClose={cancelInstall} open={confirming !== undefined}>
        <DialogTitle>Install {confirming?.label}?</DialogTitle>
        <DialogContent>
          <Typography>
            This will close {confirming?.sessions} open sessions in this window. Sessions are not reopened
            automatically; your history stays.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelInstall}>Cancel</Button>
          <Button onClick={confirmInstall} variant="contained">
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
