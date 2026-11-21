/**
 * PROTOTYPE Orchestration Page, variant A, "Graph first". The view-only plan graph (lanes per cwd, milestone bands,
 * planned nodes as ghosts) fills the middle. Steering lives in a right-hand panel: a session list, plus the chosen
 * session's chat with the steering Composer. The milestone gate is a banner over the graph.
 */
import { AgentLaunchTargetIcon, allotmentSashSx } from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { useState } from 'react';
import type { FC } from 'react';

import type { NodeState, Orchestration } from './threePagesFixtures.ts';
import {
  cwdCaption,
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
} from './threePagesShared.tsx';
import type { StoreApi } from './threePagesShared.tsx';

const LANE_W = 230;
const NODE_W = 200;
const NODE_H = 46;
const GAP = 14;
const BAND_H = 26;
const HEADER_H = 32;
const PAD_X = 24;

type Box2 = { readonly x: number; readonly y: number };
type GNode = Box2 & {
  readonly key: string;
  readonly title: string;
  readonly state: NodeState;
  readonly role: 'orchestrator' | 'validator' | 'worker';
  readonly ghost: boolean;
  readonly fix: boolean;
  readonly fromFeedback: boolean;
};

const layout = (orch: Orchestration) => {
  const orchestrator = sessionByKey(orch, orch.orchestratorKey);
  const home = orchestrator?.cwd ?? '';
  const lanes = [...new Set([home, ...orch.sessions.map(session => session.cwd)])];
  const laneX = (cwd: string) => PAD_X + lanes.indexOf(cwd) * LANE_W + (LANE_W - NODE_W) / 2;
  const nodes: GNode[] = [];
  const bands: {
    readonly id: string;
    readonly label: string;
    readonly state: NodeState;
    readonly y: number;
    readonly gate: boolean;
  }[] = [];
  let y = HEADER_H + 8;
  if (orchestrator !== undefined) {
    nodes.push({
      fix: false,
      fromFeedback: false,
      ghost: false,
      key: orchestrator.key,
      role: 'orchestrator',
      state: orchestrator.state,
      title: orchestrator.title,
      x: laneX(home),
      y,
    });
    y += NODE_H + GAP;
  }
  for (const { milestone, nodes: planNodes } of planRows(orch)) {
    bands.push({
      gate: false,
      id: milestone.id,
      label: `${milestone.title}${milestone.round > 0 ? ` · round ${milestone.round}` : ''}`,
      state: milestone.state,
      y,
    });
    y += BAND_H + 8;
    for (const node of planNodes) {
      nodes.push({
        fix: node.fix,
        fromFeedback: node.fromFeedback,
        ghost: node.session === undefined,
        key: node.session?.key ?? node.id,
        role: node.kind === 'validator' ? 'validator' : 'worker',
        state: node.state,
        title: node.title,
        x: laneX(node.session?.cwd ?? home),
        y,
      });
      y += NODE_H + GAP;
    }
    if (orch.stopAtMilestones) {
      bands.push({
        gate: true,
        id: `${milestone.id}-gate`,
        label: orch.gateMilestoneId === milestone.id ? 'Stopped here: waiting for your testing' : 'Milestone gate',
        state: orch.gateMilestoneId === milestone.id ? 'waiting' : 'not-started',
        y,
      });
      y += BAND_H + 8;
    }
  }
  return { bands, height: y, lanes, nodes, width: PAD_X * 2 + lanes.length * LANE_W };
};

/** View-only: no click handlers on purpose (Epic #424). */
const LaneGraph: FC<{ readonly orch: Orchestration }> = ({ orch }) => {
  const theme = useTheme();
  const { bands, height, lanes, nodes, width } = layout(orch);
  const [root] = nodes;
  return (
    <Box sx={{ height, minWidth: width, position: 'relative', width }}>
      {lanes.map((cwd, index) => (
        <Box
          key={cwd}
          sx={{
            bgcolor: index % 2 === 0 ? 'action.hover' : 'transparent',
            bottom: 0,
            left: PAD_X + index * LANE_W,
            position: 'absolute',
            top: 0,
            width: LANE_W,
          }}
        >
          <Typography
            noWrap
            sx={{ display: 'block', fontWeight: 600, lineHeight: `${HEADER_H}px`, textAlign: 'center' }}
            variant="caption"
          >
            {cwdCaption(cwd)}
          </Typography>
        </Box>
      ))}
      <svg height={height} style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0 }} width={width}>
        {root === undefined
          ? null
          : nodes.slice(1).map(node => {
              const ax = root.x + NODE_W / 2;
              const ay = root.y + NODE_H;
              const bx = node.x + (node.x === root.x ? 0 : NODE_W / 2);
              const by = node.y + (node.x === root.x ? NODE_H / 2 : 0);
              const d =
                node.x === root.x
                  ? `M ${root.x} ${root.y + NODE_H / 2} C ${root.x - 18} ${root.y + NODE_H}, ${bx - 18} ${by}, ${bx} ${by}`
                  : `M ${ax} ${ay} C ${ax} ${(ay + by) / 2}, ${bx} ${(ay + by) / 2}, ${bx} ${by}`;
              return (
                <path
                  d={d}
                  fill="none"
                  key={node.key}
                  opacity={node.ghost ? 0.35 : 0.8}
                  stroke={node.fix ? theme.palette.error.main : theme.palette.text.disabled}
                  strokeDasharray={node.ghost ? '3 4' : node.fix ? '2 3' : '6 4'}
                  strokeWidth={1.25}
                />
              );
            })}
      </svg>
      {bands.map(band => (
        <Stack
          direction="row"
          key={band.id}
          sx={{
            alignItems: 'center',
            borderBottom: band.gate ? '1px dashed' : 1,
            borderColor: NODE_COLOR[band.state],
            gap: 1,
            height: BAND_H,
            left: 8,
            position: 'absolute',
            right: 8,
            top: band.y,
          }}
        >
          {band.gate ? <Typography variant="caption">⏸</Typography> : <NodeDot state={band.state} />}
          <Typography
            color={band.gate ? 'text.secondary' : undefined}
            sx={{ fontWeight: band.gate ? 400 : 600 }}
            variant="caption"
          >
            {band.label}
          </Typography>
          {band.gate ? null : (
            <Typography color="text.secondary" variant="caption">
              {NODE_LABEL[band.state]}
            </Typography>
          )}
        </Stack>
      ))}
      {nodes.map(node => (
        <Box
          key={node.key}
          sx={{
            bgcolor: node.ghost ? 'transparent' : 'background.paper',
            border: node.ghost ? '1px dashed' : 1,
            borderColor: node.fromFeedback ? 'warning.main' : 'divider',
            borderLeft: node.ghost ? undefined : 3,
            borderLeftColor: node.ghost ? undefined : NODE_COLOR[node.state],
            borderRadius: 1,
            color: node.ghost ? 'text.disabled' : 'text.primary',
            height: NODE_H,
            left: node.x,
            position: 'absolute',
            px: 1,
            py: 0.5,
            top: node.y,
            width: NODE_W,
          }}
        >
          <Typography noWrap sx={{ display: 'block', fontWeight: 500 }} variant="caption">
            {node.fix ? '↺ ' : ''}
            {node.title}
          </Typography>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
            <NodeDot state={node.state} />
            <Typography color="text.secondary" sx={{ flex: 1 }} variant="caption">
              {NODE_LABEL[node.state]}
            </Typography>
            <Typography color="text.secondary" variant="caption">
              {node.role === 'worker' ? '' : node.role}
            </Typography>
          </Stack>
        </Box>
      ))}
    </Box>
  );
};

const SessionsPanel: FC<{ readonly api: StoreApi; readonly orch: Orchestration }> = ({ api, orch }) => {
  const [key, setKey] = useState<string>(orch.orchestratorKey);
  const session = sessionByKey(orch, key) ?? sessionByKey(orch, orch.orchestratorKey);
  return (
    <Allotment vertical>
      <Allotment.Pane minSize={120} preferredSize={220}>
        <Box sx={{ bgcolor: 'background.paper', height: '100%', overflow: 'auto' }}>
          <PanelTitle>Sessions ({orch.sessions.length})</PanelTitle>
          {orch.sessions.map(candidate => (
            <Stack
              direction="row"
              key={candidate.key}
              onClick={() => {
                setKey(candidate.key);
              }}
              role="button"
              sx={{
                alignItems: 'center',
                bgcolor: candidate.key === session?.key ? 'action.selected' : 'transparent',
                cursor: 'pointer',
                gap: 1,
                px: 2,
                py: 0.5,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <NodeDot state={candidate.state} />
              <AgentLaunchTargetIcon launchTarget={candidate.launchTarget} />
              <Typography noWrap sx={{ flex: 1 }} variant="body2">
                {candidate.title}
              </Typography>
              {candidate.queue.length > 0 ? (
                <Typography color="text.secondary" variant="caption">
                  {candidate.queue.length} queued
                </Typography>
              ) : null}
              {candidate.role === 'worker' ? null : <RoleChip role={candidate.role} />}
            </Stack>
          ))}
        </Box>
      </Allotment.Pane>
      <Allotment.Pane minSize={240}>
        <Box sx={{ borderColor: 'divider', borderTop: 1, height: '100%' }}>
          {session === undefined ? null : <OrchestrationChat api={api} orch={orch} session={session} />}
        </Box>
      </Allotment.Pane>
    </Allotment>
  );
};

export const OrchestrationVariantA: FC<{
  readonly api: StoreApi;
  readonly onSelect: (id: string) => void;
  readonly orch: Orchestration;
}> = ({ api, onSelect, orch }) => (
  <Box sx={theme => ({ ...allotmentSashSx(theme), height: '100%' })}>
    <Allotment>
      <Allotment.Pane minSize={200} preferredSize={260}>
        <OrchestrationList api={api} onSelect={onSelect} selectedId={orch.id} />
      </Allotment.Pane>
      <Allotment.Pane minSize={360}>
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
          {orch.runState === 'gated' ? (
            <Paper sx={{ borderColor: 'warning.main', borderLeft: 4, flexShrink: 0, m: 2, p: 2 }} variant="outlined">
              <GateReview api={api} orch={orch} />
            </Paper>
          ) : null}
          {orch.runState === 'halted' ? (
            <Alert severity="error" sx={{ flexShrink: 0, mx: 2, my: 1 }}>
              {orch.haltReason} Answer the Orchestrator on the right to take over.
            </Alert>
          ) : null}
          {orch.runState === 'drafting' ? (
            <Alert severity="info" sx={{ flexShrink: 0, mx: 2, my: 1 }}>
              Drafting: the graph shows the plan so far. Talk to the Orchestrator on the right to shape it.
            </Alert>
          ) : null}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <LaneGraph orch={orch} />
          </Box>
        </Box>
      </Allotment.Pane>
      <Allotment.Pane minSize={300} preferredSize={420}>
        <SessionsPanel api={api} key={orch.id} orch={orch} />
      </Allotment.Pane>
    </Allotment>
  </Box>
);
