/**
 * PROTOTYPE Variant A — ChatGPT nested accordion.
 * Outer "Worked for Xs" collapses the whole block; each step expands piece-by-piece.
 */
import { LucideMuiIcon } from '@lib/ui';
import { ChevronDown, ChevronRight, Link, Network, Search, SquareTerminal, Wrench } from 'lucide-react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import type { WorkStep, WorkTurnFixture } from './fixture.ts';
import { PrototypeChatShell, PrototypeStateDump } from './shared.tsx';

export const VARIANT_A_NAME = 'Nested accordion (ChatGPT)';

const stepIcon = (kind: WorkStep['kind']): ReactNode => {
  switch (kind) {
    case 'group':
      return <LucideMuiIcon fontSize="inherit" icon={Network} />;
    case 'read':
      return <LucideMuiIcon fontSize="inherit" icon={Link} />;
    case 'search':
      return <LucideMuiIcon fontSize="inherit" icon={Search} />;
    case 'shell':
      return <LucideMuiIcon fontSize="inherit" icon={SquareTerminal} />;
    case 'tool':
      return <LucideMuiIcon fontSize="inherit" icon={Wrench} />;
  }
};

const StepRow: FC<{
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly step: WorkStep;
}> = ({ expanded, onToggle, step }) => {
  const canExpand = step.detail !== undefined || step.kind === 'group';
  const detailOpen = expanded && step.detail !== undefined;
  return (
    <Box sx={{ py: 0.25 }}>
      <Box
        component={canExpand ? 'button' : 'div'}
        onClick={canExpand ? onToggle : undefined}
        sx={{
          alignItems: 'center',
          bgcolor: 'transparent',
          border: 0,
          color: 'text.secondary',
          cursor: canExpand ? 'pointer' : 'default',
          display: 'flex',
          font: 'inherit',
          gap: 1,
          px: 0,
          py: 0.5,
          textAlign: 'left',
          width: '100%',
        }}
        type={canExpand ? 'button' : undefined}
      >
        <Box sx={{ display: 'inline-flex', fontSize: 16, opacity: 0.8 }}>{stepIcon(step.kind)}</Box>
        <Typography sx={{ flex: 1 }} variant="body2">
          {step.title}
        </Typography>
        {canExpand ? <LucideMuiIcon fontSize="small" icon={expanded ? ChevronDown : ChevronRight} /> : null}
      </Box>
      <Collapse in={detailOpen}>
        <Box
          sx={{
            bgcolor: 'action.hover',
            borderRadius: 1,
            color: 'text.secondary',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            ml: 3,
            mt: 0.5,
            p: 1.25,
            whiteSpace: 'pre-wrap',
          }}
        >
          <Typography color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }} variant="caption">
            Shell
          </Typography>
          {step.detail}
        </Box>
      </Collapse>
    </Box>
  );
};

export const VariantA: FC<{
  readonly aboveComposer?: ReactNode;
  readonly fixture: WorkTurnFixture;
}> = ({ aboveComposer, fixture }) => {
  const [outerOpen, setOuterOpen] = useState(false);
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(() => new Set());

  const toggleStep = (id: string) => {
    setOpenSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <PrototypeChatShell aboveComposer={aboveComposer} fixture={fixture}>
      <Box sx={{ borderColor: 'divider', borderTop: 1, mt: 1, pt: 1 }}>
        <Box
          component="button"
          onClick={() => {
            setOuterOpen(v => !v);
          }}
          sx={{
            alignItems: 'center',
            bgcolor: 'transparent',
            border: 0,
            color: 'text.secondary',
            cursor: 'pointer',
            display: 'inline-flex',
            font: 'inherit',
            gap: 0.5,
            px: 0,
            py: 0.5,
          }}
          type="button"
        >
          <Typography color="text.secondary" variant="body2">
            {fixture.durationLabel}
          </Typography>
          <LucideMuiIcon fontSize="small" icon={outerOpen ? ChevronDown : ChevronRight} />
        </Box>
        <Collapse in={outerOpen}>
          <Typography color="text.secondary" sx={{ mb: 1, mt: 0.5 }} variant="body2">
            {fixture.intent}
          </Typography>
          {fixture.steps.map(step => (
            <StepRow
              expanded={openSteps.has(step.id)}
              key={step.id}
              onToggle={() => {
                toggleStep(step.id);
              }}
              step={step}
            />
          ))}
        </Collapse>
      </Box>
      <PrototypeStateDump>
        {JSON.stringify({ openSteps: [...openSteps], outerOpen, variant: 'A' }, null, 2)}
      </PrototypeStateDump>
    </PrototypeChatShell>
  );
};
