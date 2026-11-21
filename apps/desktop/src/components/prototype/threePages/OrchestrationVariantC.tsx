/**
 * PROTOTYPE Orchestration Page, variant C, "Control room". The top half is the view-only plan graph as milestone
 * columns, left to right, with gates between them. The bottom half is a tile per live session, each with a short tail
 * of its output and inline steering (Interrupt / Queue / Send). At a milestone gate, a review step with the milestone's
 * results and the feedback box replaces the tiles. A full chat opens in a dialog.
 */
import { AgentLaunchTargetIcon, allotmentSashSx } from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { useState } from 'react';
import type { FC } from 'react';

import type { Orchestration, OSession } from './threePagesFixtures.ts';
import {
  GateReview,
  GateToggle,
  NODE_COLOR,
  NODE_LABEL,
  NodeDot,
  OrchestrationChat,
  OrchestrationList,
  PanelTitle,
  planRows,
  RoleChip,
  RunControls,
  RunStateChip,
  sessionByKey,
  SteeringComposer,
} from './threePagesShared.tsx';
import type { StoreApi } from './threePagesShared.tsx';

/** View-only. */
const ColumnGraph: FC<{ readonly orch: Orchestration }> = ({ orch }) => {
  const orchestrator = sessionByKey(orch, orch.orchestratorKey);
  return (
    <Stack direction="row" sx={{ alignItems: 'stretch', gap: 1, minWidth: 'max-content', p: 2 }}>
      {orchestrator === undefined ? null : (
        <Paper
          sx={{ alignSelf: 'center', borderLeft: 3, borderLeftColor: NODE_COLOR[orchestrator.state], p: 1, width: 150 }}
          variant="outlined"
        >
          <Typography sx={{ display: 'block', fontWeight: 600 }} variant="caption">
            Orchestrator
          </Typography>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
            <NodeDot state={orchestrator.state} />
            <Typography color="text.secondary" variant="caption">
              {NODE_LABEL[orchestrator.state]}
            </Typography>
          </Stack>
        </Paper>
      )}
      {planRows(orch).map(({ milestone, nodes }, index) => (
        <Stack direction="row" key={milestone.id} sx={{ alignItems: 'center', gap: 1 }}>
          <Typography color="text.disabled">→</Typography>
          <Box
            sx={{
              border: 1,
              borderColor: milestone.state === 'not-started' ? 'divider' : NODE_COLOR[milestone.state],
              borderRadius: 1,
              borderStyle: milestone.state === 'not-started' ? 'dashed' : 'solid',
              p: 1,
              width: 220,
            }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 0.5 }}>
              <NodeDot state={milestone.state} />
              <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="caption">
                M{index + 1} · {milestone.title}
              </Typography>
            </Stack>
            <Stack spacing={0.5}>
              {nodes.map(node => (
                <Stack
                  direction="row"
                  key={node.id}
                  sx={{
                    alignItems: 'center',
                    bgcolor: node.session === undefined ? 'transparent' : 'action.hover',
                    border: node.session === undefined ? '1px dashed' : 0,
                    borderColor: 'divider',
                    borderRadius: 0.5,
                    color: node.session === undefined ? 'text.disabled' : 'text.primary',
                    gap: 0.75,
                    px: 0.75,
                    py: 0.25,
                  }}
                >
                  <NodeDot state={node.state} />
                  <Typography
                    color={node.fix ? 'error' : node.fromFeedback ? 'warning.main' : undefined}
                    noWrap
                    sx={{ flex: 1 }}
                    variant="caption"
                  >
                    {node.kind === 'validator' ? '✓ ' : node.fix ? '↺ ' : ''}
                    {node.title}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
          {orch.stopAtMilestones && index < orch.milestones.length - 1 ? (
            <Typography
              color={orch.gateMilestoneId === milestone.id ? 'warning.main' : 'text.disabled'}
              sx={{ fontSize: orch.gateMilestoneId === milestone.id ? 22 : 14 }}
              title="Milestone gate"
            >
              ⏸
            </Typography>
          ) : null}
        </Stack>
      ))}
    </Stack>
  );
};

const Tile: FC<{
  readonly api: StoreApi;
  readonly onOpen: () => void;
  readonly orch: Orchestration;
  readonly session: OSession;
}> = ({ api, onOpen, orch, session }) => (
  <Paper
    sx={{
      borderColor: session.state === 'waiting' ? 'warning.main' : 'divider',
      borderTop: 3,
      borderTopColor: NODE_COLOR[session.state],
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      p: 1.5,
    }}
    variant="outlined"
  >
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
      <AgentLaunchTargetIcon launchTarget={session.launchTarget} />
      <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="body2">
        {session.title}
      </Typography>
      {session.role === 'worker' ? null : <RoleChip role={session.role} />}
    </Stack>
    <Typography color="text.secondary" variant="caption">
      {NODE_LABEL[session.state]}
    </Typography>
    <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: 11, minHeight: 48, p: 1 }}>
      {session.transcript.slice(-2).map(line => (
        <Box
          key={`${line.kind}:${line.text}`}
          sx={{ color: line.kind === 'permission' ? 'warning.main' : 'text.secondary' }}
        >
          {line.kind === 'user' ? '› ' : ''}
          {line.text}
        </Box>
      ))}
    </Box>
    <SteeringComposer api={api} compact orch={orch} session={session} />
    <Button onClick={onOpen} size="small" sx={{ alignSelf: 'flex-start' }}>
      Open chat
    </Button>
  </Paper>
);

const LiveArea: FC<{ readonly api: StoreApi; readonly orch: Orchestration }> = ({ api, orch }) => {
  const [openKey, setOpenKey] = useState<string | undefined>(undefined);
  const open = sessionByKey(orch, openKey);
  const live = orch.sessions.filter(
    session =>
      session.state === 'running' ||
      session.state === 'waiting' ||
      session.state === 'paused' ||
      session.role === 'orchestrator',
  );
  const gate = orch.milestones.find(milestone => milestone.id === orch.gateMilestoneId);
  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
      {orch.runState === 'halted' ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {orch.haltReason}
        </Alert>
      ) : null}
      {orch.runState === 'gated' && gate !== undefined ? (
        <Stack direction="row" spacing={3}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }} variant="subtitle2">
              Review: {gate.title}
            </Typography>
            {orch.tasks
              .filter(task => task.milestoneId === gate.id)
              .map(task => {
                const session = sessionByKey(orch, task.sessionKey);
                return (
                  <Stack direction="row" key={task.id} sx={{ alignItems: 'center', gap: 1, py: 0.25 }}>
                    <NodeDot state={session?.state ?? 'not-started'} />
                    <Typography sx={{ flex: 1 }} variant="body2">
                      {task.title}
                    </Typography>
                    {session === undefined ? null : (
                      <Button
                        onClick={() => {
                          setOpenKey(session.key);
                        }}
                        size="small"
                      >
                        Transcript
                      </Button>
                    )}
                  </Stack>
                );
              })}
            <Typography color="text.secondary" sx={{ display: 'block', mt: 1 }} variant="caption">
              Validator: passed on round {gate.round}, {gate.findings.length} findings
            </Typography>
          </Box>
          <Box sx={{ flex: 1.2 }}>
            <GateReview api={api} orch={orch} />
          </Box>
        </Stack>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {live.map(session => (
            <Tile
              api={api}
              key={session.key}
              onOpen={() => {
                setOpenKey(session.key);
              }}
              orch={orch}
              session={session}
            />
          ))}
        </Box>
      )}
      <Dialog
        fullWidth
        maxWidth="md"
        onClose={() => {
          setOpenKey(undefined);
        }}
        open={open !== undefined}
        slotProps={{ paper: { sx: { height: '80vh' } } }}
      >
        {open === undefined ? null : <OrchestrationChat api={api} orch={orch} session={open} />}
      </Dialog>
    </Box>
  );
};

export const OrchestrationVariantC: FC<{
  readonly api: StoreApi;
  readonly onSelect: (id: string) => void;
  readonly orch: Orchestration;
}> = ({ api, onSelect, orch }) => (
  <Box sx={theme => ({ ...allotmentSashSx(theme), height: '100%' })}>
    <Allotment>
      <Allotment.Pane minSize={200} preferredSize={260}>
        <OrchestrationList api={api} onSelect={onSelect} selectedId={orch.id} />
      </Allotment.Pane>
      <Allotment.Pane minSize={480}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <PanelTitle
            actions={
              <>
                <RunStateChip state={orch.runState} />
                <GateToggle api={api} orch={orch} />
                <RunControls api={api} orch={orch} />
              </>
            }
          >
            {orch.title}
          </PanelTitle>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Allotment vertical>
              <Allotment.Pane minSize={120} preferredSize={260}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', height: '100%', overflow: 'auto' }}>
                  <ColumnGraph orch={orch} />
                </Box>
              </Allotment.Pane>
              <Allotment.Pane minSize={200}>
                <LiveArea api={api} key={orch.id} orch={orch} />
              </Allotment.Pane>
            </Allotment>
          </Box>
        </Box>
      </Allotment.Pane>
    </Allotment>
  </Box>
);
