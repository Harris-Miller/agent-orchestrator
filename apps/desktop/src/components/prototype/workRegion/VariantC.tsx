/**
 * PROTOTYPE Variant C — answer-first; work lives in a bottom sheet.
 * Transcript stays clean; a chip is the only inline affordance.
 */
import { LucideMuiIcon } from '@lib/ui';
import { X } from 'lucide-react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import type { WorkTurnFixture } from './fixture.ts';
import { PrototypeChatShell, PrototypeStateDump } from './shared.tsx';

export const VARIANT_C_NAME = 'Chip → bottom sheet';

export const VariantC: FC<{
  readonly aboveComposer?: ReactNode;
  readonly fixture: WorkTurnFixture;
}> = ({ aboveComposer, fixture }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<null | string>(null);
  const selected = fixture.steps.find(s => s.id === selectedId);

  return (
    <PrototypeChatShell aboveComposer={aboveComposer} fixture={fixture}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-start', py: 1 }}>
        <Chip
          clickable
          label={`${fixture.durationLabel} · ${String(fixture.steps.length)} steps`}
          onClick={() => {
            setSheetOpen(true);
          }}
          size="small"
          variant="outlined"
        />
      </Box>

      <Drawer
        anchor="bottom"
        onClose={() => {
          setSheetOpen(false);
        }}
        open={sheetOpen}
        slotProps={{
          paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70vh' } },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 280, p: 2 }}>
          <Box sx={{ alignItems: 'center', display: 'flex', mb: 1 }}>
            <Typography sx={{ flex: 1, fontWeight: 700 }} variant="subtitle1">
              Work log · {fixture.durationLabel}
            </Typography>
            <IconButton
              aria-label="Close work log"
              onClick={() => {
                setSheetOpen(false);
              }}
              size="small"
            >
              <LucideMuiIcon fontSize="small" icon={X} />
            </IconButton>
          </Box>
          <Typography color="text.secondary" sx={{ mb: 1 }} variant="body2">
            {fixture.intent}
          </Typography>
          <Divider />
          <Box
            sx={{
              display: 'grid',
              flex: 1,
              gap: 1,
              gridTemplateColumns: { sm: '1fr 1fr', xs: '1fr' },
              minHeight: 0,
              mt: 1,
            }}
          >
            <List dense disablePadding sx={{ overflow: 'auto' }}>
              {fixture.steps.map(step => (
                <ListItemButton
                  key={step.id}
                  onClick={() => {
                    setSelectedId(step.id);
                  }}
                  selected={selectedId === step.id}
                >
                  <ListItemText primary={step.title} secondary={step.kind} />
                </ListItemButton>
              ))}
            </List>
            <Box
              sx={{
                bgcolor: 'action.hover',
                borderRadius: 1,
                color: 'text.secondary',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                minHeight: 120,
                overflow: 'auto',
                p: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {selected?.detail ?? (selected ? '(no detail)' : 'Select a step')}
            </Box>
          </Box>
        </Box>
      </Drawer>

      <PrototypeStateDump>{JSON.stringify({ selectedId, sheetOpen, variant: 'C' }, null, 2)}</PrototypeStateDump>
    </PrototypeChatShell>
  );
};
