/**
 * PROTOTYPE Variant B — always-visible timeline rail.
 * Steps stay on the spine; expand-in-place for detail. No nested outer accordion.
 */
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import type { WorkTurnFixture } from './fixture.ts';
import { PrototypeChatShell, PrototypeStateDump } from './shared.tsx';

export const VARIANT_B_NAME = 'Timeline spine';

export const VariantB: FC<{
  readonly aboveComposer?: ReactNode;
  readonly fixture: WorkTurnFixture;
}> = ({ aboveComposer, fixture }) => {
  const [openId, setOpenId] = useState<null | string>(null);

  return (
    <PrototypeChatShell aboveComposer={aboveComposer} fixture={fixture}>
      <Box sx={{ display: 'grid', gap: 0, gridTemplateColumns: '20px 1fr', mt: 1, py: 1 }}>
        <Box sx={{ position: 'relative' }}>
          <Box
            sx={{
              bgcolor: 'divider',
              bottom: 8,
              left: '50%',
              position: 'absolute',
              top: 8,
              transform: 'translateX(-50%)',
              width: 2,
            }}
          />
        </Box>
        <Box>
          <Typography color="text.secondary" sx={{ mb: 1.5 }} variant="caption">
            {fixture.durationLabel} · {fixture.steps.length} steps · click a node for detail
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }} variant="body2">
            {fixture.intent}
          </Typography>
          {fixture.steps.map((step, i) => {
            const open = openId === step.id;
            const detailOpen = open && step.detail !== undefined;
            return (
              <Box key={step.id} sx={{ display: 'grid', gap: 1, gridTemplateColumns: '20px 1fr', mb: 1.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', ml: '-20px', position: 'relative' }}>
                  <Box
                    sx={{
                      bgcolor: open ? 'primary.main' : 'background.paper',
                      border: 2,
                      borderColor: open ? 'primary.main' : 'text.secondary',
                      borderRadius: '50%',
                      height: 10,
                      mt: 0.75,
                      width: 10,
                      zIndex: 1,
                    }}
                  />
                </Box>
                <Box>
                  <Box
                    component="button"
                    onClick={() => {
                      setOpenId(prev => (prev === step.id ? null : step.id));
                    }}
                    sx={{
                      bgcolor: 'transparent',
                      border: 0,
                      color: 'text.primary',
                      cursor: 'pointer',
                      display: 'block',
                      font: 'inherit',
                      p: 0,
                      textAlign: 'left',
                      width: '100%',
                    }}
                    type="button"
                  >
                    <Typography variant="body2">
                      <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
                        {String(i + 1).padStart(2, '0')}
                      </Box>
                      {step.title}
                    </Typography>
                  </Box>
                  <Collapse in={detailOpen}>
                    <Box
                      sx={{
                        borderColor: 'primary.main',
                        borderLeft: 2,
                        color: 'text.secondary',
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 12,
                        mt: 0.75,
                        pl: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {step.detail}
                    </Box>
                  </Collapse>
                  {open && step.detail === undefined ? (
                    <Typography color="text.disabled" sx={{ mt: 0.5 }} variant="caption">
                      no detail payload
                    </Typography>
                  ) : null}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
      <PrototypeStateDump>{JSON.stringify({ openId, variant: 'B' }, null, 2)}</PrototypeStateDump>
    </PrototypeChatShell>
  );
};
