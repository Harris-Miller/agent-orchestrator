/**
 * PROTOTYPE Orchestration Page, variant B, "Orchestrator chat first". You mostly talk to the Orchestrator, so its chat
 * is the main pane. A session picker in the chat header switches to any Worker or Validator to steer it. The
 * milestone gate is a card pinned above the Composer. The plan graph is a compact vertical timeline on the right.
 */
import { AgentLaunchTargetIcon, allotmentSashSx } from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { useState } from 'react';
import type { FC } from 'react';

import type { Orchestration } from './threePagesFixtures.ts';
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
  RunControls,
  RunStateChip,
  sessionByKey,
} from './threePagesShared.tsx';
import type { StoreApi } from './threePagesShared.tsx';

/** View-only vertical timeline: a rail line with milestone stops, nodes hanging off each stop, gates between. */
const Timeline: FC<{ readonly orch: Orchestration }> = ({ orch }) => {
  const orchestrator = sessionByKey(orch, orch.orchestratorKey);
  return (
    <Box sx={{ p: 2 }}>
      {orchestrator === undefined ? null : (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
          <NodeDot size={12} state={orchestrator.state} />
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            Orchestrator
          </Typography>
          <Typography color="text.secondary" variant="caption">
            {NODE_LABEL[orchestrator.state]}
          </Typography>
        </Stack>
      )}
      {planRows(orch).map(({ milestone, nodes }, index, all) => (
        <Box
          key={milestone.id}
          sx={{ borderColor: NODE_COLOR[milestone.state], borderLeft: 2, ml: '5px', pb: 1, pl: 2 }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, ml: '-27px', pt: 1 }}>
            <NodeDot size={12} state={milestone.state} />
            <Typography sx={{ flex: 1, fontWeight: 600 }} variant="body2">
              M{index + 1} · {milestone.title}
            </Typography>
            <Typography color="text.secondary" variant="caption">
              {milestone.round > 0 ? `r${milestone.round}` : ''}
            </Typography>
          </Stack>
          {nodes.map(node => (
            <Stack
              direction="row"
              key={node.id}
              sx={{
                alignItems: 'center',
                color: node.session === undefined ? 'text.disabled' : 'text.primary',
                gap: 1,
                pl: 1,
                pt: 0.5,
              }}
            >
              <NodeDot state={node.state} />
              {node.session === undefined ? null : (
                <AgentLaunchTargetIcon launchTarget={node.session.launchTarget} size={12} />
              )}
              <Typography
                color={node.fix ? 'error' : node.fromFeedback ? 'warning.main' : undefined}
                noWrap
                sx={{ flex: 1, fontStyle: node.kind === 'validator' ? 'italic' : 'normal' }}
                variant="caption"
              >
                {node.fix ? '↺ ' : ''}
                {node.title}
              </Typography>
              {node.session !== undefined && node.session.queue.length > 0 ? (
                <Typography color="text.secondary" variant="caption">
                  +{node.session.queue.length}
                </Typography>
              ) : null}
            </Stack>
          ))}
          {milestone.findings.map(finding => (
            <Typography
              color="text.secondary"
              key={finding}
              sx={{ display: 'block', pl: 1, pt: 0.5 }}
              variant="caption"
            >
              ⚑ {finding}
            </Typography>
          ))}
          {orch.stopAtMilestones && index < all.length - 1 ? (
            <Typography
              color={orch.gateMilestoneId === milestone.id ? 'warning.main' : 'text.disabled'}
              sx={{ display: 'block', fontWeight: orch.gateMilestoneId === milestone.id ? 600 : 400, pt: 1 }}
              variant="caption"
            >
              ⏸ {orch.gateMilestoneId === milestone.id ? 'Stopped: waiting for your testing' : 'Gate'}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Box>
  );
};

const ChatMain: FC<{ readonly api: StoreApi; readonly orch: Orchestration }> = ({ api, orch }) => {
  const [key, setKey] = useState(orch.orchestratorKey);
  const session = sessionByKey(orch, key) ?? sessionByKey(orch, orch.orchestratorKey);
  if (session === undefined) return null;
  const onOrchestrator = session.key === orch.orchestratorKey;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', borderBottom: 1, borderColor: 'divider', flexShrink: 0, gap: 1, px: 2, py: 0.5 }}
      >
        <Typography color="text.secondary" variant="caption">
          Talking to
        </Typography>
        <Select
          onChange={event => {
            setKey(event.target.value);
          }}
          size="small"
          sx={{ fontSize: '0.8rem', minWidth: 260 }}
          value={session.key}
          variant="standard"
        >
          {orch.sessions.map(candidate => (
            <MenuItem key={candidate.key} value={candidate.key}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <NodeDot state={candidate.state} />
                {candidate.title}
                {candidate.state === 'waiting' ? ' · waiting on you' : ''}
              </Stack>
            </MenuItem>
          ))}
        </Select>
        <Box sx={{ flex: 1 }} />
        <RunStateChip state={orch.runState} />
        <GateToggle api={api} orch={orch} />
        <RunControls api={api} orch={orch} />
      </Stack>
      {orch.runState === 'halted' && onOrchestrator ? (
        <Alert severity="error" sx={{ flexShrink: 0, mx: 2, mt: 1 }}>
          {orch.haltReason}
        </Alert>
      ) : null}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <OrchestrationChat api={api} orch={orch} session={session} />
      </Box>
      {orch.runState === 'gated' && onOrchestrator ? (
        <Paper elevation={6} sx={{ borderColor: 'warning.main', borderTop: 3, flexShrink: 0, mx: 2, mb: 2, p: 2 }}>
          <GateReview api={api} dense orch={orch} />
        </Paper>
      ) : null}
    </Box>
  );
};

export const OrchestrationVariantB: FC<{
  readonly api: StoreApi;
  readonly onSelect: (id: string) => void;
  readonly orch: Orchestration;
}> = ({ api, onSelect, orch }) => (
  <Box sx={theme => ({ ...allotmentSashSx(theme), height: '100%' })}>
    <Allotment>
      <Allotment.Pane minSize={200} preferredSize={260}>
        <OrchestrationList api={api} onSelect={onSelect} selectedId={orch.id} />
      </Allotment.Pane>
      <Allotment.Pane minSize={420}>
        <ChatMain api={api} key={orch.id} orch={orch} />
      </Allotment.Pane>
      <Allotment.Pane minSize={240} preferredSize={320}>
        <Box
          sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
        >
          <PanelTitle>Plan</PanelTitle>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Timeline orch={orch} />
          </Box>
        </Box>
      </Allotment.Pane>
    </Allotment>
  </Box>
);
