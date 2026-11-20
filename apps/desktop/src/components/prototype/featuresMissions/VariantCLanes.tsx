/**
 * PROTOTYPE variant C — "Lineage lanes": how work moved is primary. One lane per cwd (Projects and contextless dirs),
 * time runs down, edges show Handoffs, Mission spawns and fix tasks; Mission milestones are bands across all lanes and
 * planned tasks are ghosts. Chat docks underneath, like the Developer panel.
 */
import { AgentLaunchTargetIcon, allotmentSashSx, LucideMuiIcon, PANEL_HEADER_HEIGHT } from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { Layers, Plus, Rocket } from 'lucide-react';
import type { FC } from 'react';

import { needsYou, sessionByKey } from './featuresMissionsFixtures.ts';
import type { Feature, LinkKind, Milestone, ProtoSession, Task } from './featuresMissionsFixtures.ts';
import {
  cwdCaption,
  MissionProgress,
  RoleChip,
  SessionPane,
  STATE_COLOR,
  STATE_LABEL,
  StateDot,
} from './featuresMissionsShared.tsx';
import type { PrototypeContext } from './featuresMissionsShared.tsx';

const LANE_W = 240;
const NODE_W = 210;
const NODE_H = 50;
const ROW_GAP = 18;
const BAND_H = 28;
const HEADER_H = 36;
const PAD_X = 72;

type Placed =
  | { readonly kind: 'node'; readonly session: ProtoSession; readonly x: number; readonly y: number }
  | { readonly kind: 'ghost'; readonly task: Task; readonly x: number; readonly y: number }
  | { readonly kind: 'band'; readonly milestone: Milestone; readonly y: number };

const layout = (feature: Feature) => {
  const sessions = [...feature.sessions].sort((a, b) => b.startedAgo - a.startedAgo);
  const lanes = [...new Set(sessions.map(session => session.cwd))];
  const laneX = (cwd: string) => PAD_X + lanes.indexOf(cwd) * LANE_W + (LANE_W - NODE_W) / 2;
  const placed: Placed[] = [];
  let y = HEADER_H + 12;
  let lastMilestone: string | undefined;
  const band = (milestone: Milestone) => {
    placed.push({ kind: 'band', milestone, y });
    y += BAND_H + 10;
    lastMilestone = milestone.id;
  };
  for (const session of sessions) {
    const milestone = feature.mission?.milestones.find(candidate => candidate.id === session.milestoneId);
    if (milestone !== undefined && milestone.id !== lastMilestone) band(milestone);
    placed.push({ kind: 'node', session, x: laneX(session.cwd), y });
    y += NODE_H + ROW_GAP;
  }
  // Milestones nothing has started yet: their planned tasks as ghosts in the orchestrator's lane.
  const orchestrator =
    feature.mission === undefined ? undefined : sessionByKey(feature, feature.mission.orchestratorKey);
  const unstarted = (feature.mission?.milestones ?? []).filter(
    milestone => !sessions.some(session => session.milestoneId === milestone.id),
  );
  for (const milestone of unstarted) {
    band(milestone);
    for (const task of feature.mission!.tasks.filter(candidate => candidate.milestoneId === milestone.id)) {
      placed.push({ kind: 'ghost', task, x: laneX(orchestrator?.cwd ?? lanes[0] ?? ''), y });
      y += NODE_H + ROW_GAP;
    }
  }
  return { height: y, lanes, placed, width: PAD_X * 2 + lanes.length * LANE_W };
};

const Edge: FC<{
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly via: LinkKind;
}> = ({ from, to, via }) => {
  const theme = useTheme();
  const stroke = {
    fix: theme.palette.error.main,
    handoff: theme.palette.primary.main,
    spawn: theme.palette.text.disabled,
  }[via];
  const dash = { fix: '2 4', handoff: undefined, spawn: '6 4' }[via];
  // Same lane: bow out to the left so the line does not run through the nodes between.
  const d =
    from.x === to.x
      ? (() => {
          const bow = Math.min(64, 16 + (to.y - from.y) / 12);
          const ay = from.y + NODE_H / 2;
          const by = to.y + NODE_H / 2;
          return `M ${from.x} ${ay} C ${from.x - bow} ${ay}, ${to.x - bow} ${by}, ${to.x} ${by}`;
        })()
      : (() => {
          const ax = from.x + NODE_W / 2;
          const ay = from.y + NODE_H;
          const bx = to.x + NODE_W / 2;
          const midY = (ay + to.y) / 2;
          return `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${to.y}`;
        })();
  return (
    <path d={d} fill="none" markerEnd={`url(#arrow-${via})`} stroke={stroke} strokeDasharray={dash} strokeWidth={1.5} />
  );
};

const Lanes: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const theme = useTheme();
  const { feature } = ctx;
  const { height, lanes, placed, width } = layout(feature);
  const nodeAt = new Map(
    placed.flatMap(item => (item.kind === 'node' ? [[item.session.key, { x: item.x, y: item.y }] as const] : [])),
  );
  const markerColor = {
    fix: theme.palette.error.main,
    handoff: theme.palette.primary.main,
    spawn: theme.palette.text.disabled,
  };
  return (
    <Box sx={{ height, minWidth: width, position: 'relative', width }}>
      {lanes.map((cwd, index) => (
        <Box
          key={cwd}
          sx={{
            bgcolor: index % 2 === 0 ? 'action.hover' : 'transparent',
            borderLeft: cwd.includes('/.hoa/contextless/') ? '1px dashed' : 0,
            borderColor: 'divider',
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
            title={cwd}
            variant="caption"
          >
            {cwdCaption(cwd)}
          </Typography>
        </Box>
      ))}
      <svg height={height} style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0 }} width={width}>
        <defs>
          {(['fix', 'handoff', 'spawn'] as const).map(via => (
            <marker
              id={`arrow-${via}`}
              key={via}
              markerHeight="6"
              markerWidth="6"
              orient="auto"
              refX="5"
              refY="3"
              viewBox="0 0 6 6"
            >
              <path d="M0,0 L6,3 L0,6 z" fill={markerColor[via]} />
            </marker>
          ))}
        </defs>
        {feature.sessions.map(session => {
          const to = nodeAt.get(session.key);
          const from = session.from === undefined ? undefined : nodeAt.get(session.from.key);
          return to === undefined || from === undefined || session.from === undefined ? null : (
            <Edge from={from} key={session.key} to={to} via={session.from.via} />
          );
        })}
      </svg>
      {placed.map(item => {
        if (item.kind === 'band') {
          return (
            <Stack
              direction="row"
              key={`band-${item.milestone.id}`}
              sx={{
                alignItems: 'center',
                borderBottom: 1,
                borderColor: STATE_COLOR[item.milestone.state],
                gap: 1,
                height: BAND_H,
                left: 8,
                position: 'absolute',
                right: 8,
                top: item.y,
              }}
            >
              <StateDot state={item.milestone.state} />
              <Typography sx={{ fontWeight: 600 }} variant="caption">
                {item.milestone.title}
              </Typography>
              <Typography color="text.secondary" variant="caption">
                {STATE_LABEL[item.milestone.state]}
                {item.milestone.round > 0 ? ` · round ${item.milestone.round}` : ''}
                {item.milestone.findings.length > 0 ? ` · ${item.milestone.findings.length} findings` : ''}
              </Typography>
            </Stack>
          );
        }
        if (item.kind === 'ghost') {
          return (
            <Box
              key={`ghost-${item.task.id}`}
              sx={{
                alignItems: 'center',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                color: 'text.disabled',
                display: 'flex',
                height: NODE_H,
                left: item.x,
                position: 'absolute',
                px: 1,
                top: item.y,
                width: NODE_W,
              }}
            >
              <Typography noWrap variant="caption">
                Planned: {item.task.title}
              </Typography>
            </Box>
          );
        }
        const { session } = item;
        const selected = ctx.focused?.key === session.key;
        return (
          <Box
            key={session.key}
            onClick={() => {
              ctx.openSession(session);
            }}
            role="button"
            sx={{
              bgcolor: 'background.paper',
              border: 1,
              borderColor: selected ? 'primary.main' : 'divider',
              borderLeft: 3,
              borderLeftColor: STATE_COLOR[session.state],
              borderRadius: 1,
              boxShadow: selected ? 3 : 0,
              cursor: 'pointer',
              height: NODE_H,
              left: item.x,
              position: 'absolute',
              px: 1,
              py: 0.5,
              top: item.y,
              width: NODE_W,
            }}
            tabIndex={0}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
              <AgentLaunchTargetIcon launchTarget={session.launchTarget} size={14} />
              <Typography noWrap sx={{ flex: 1, fontWeight: selected ? 600 : 500 }} variant="caption">
                {session.title}
              </Typography>
            </Stack>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, mt: 0.25 }}>
              <StateDot state={session.state} />
              <Typography color="text.secondary" sx={{ flex: 1 }} variant="caption">
                {STATE_LABEL[session.state]}
                {session.real === undefined ? '' : ' · live'}
              </Typography>
              <RoleChip role={session.role} />
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
};

const FeatureList: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => (
  <Box sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, height: PANEL_HEADER_HEIGHT, px: 2 }}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
        Features
      </Typography>
    </Box>
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {ctx.features.map(feature => {
        const selected = feature.id === ctx.feature.id;
        return (
          <Box
            key={feature.id}
            onClick={() => {
              ctx.selectFeature(feature.id);
            }}
            role="button"
            sx={{
              bgcolor: selected ? 'action.selected' : 'transparent',
              cursor: 'pointer',
              px: 2,
              py: 1,
              '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
            }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <LucideMuiIcon
                icon={feature.mission === undefined ? Layers : Rocket}
                sx={{ color: 'text.secondary', fontSize: '1rem' }}
              />
              <Typography noWrap sx={{ flex: 1, fontWeight: selected ? 600 : 400 }} variant="body2">
                {feature.name}
              </Typography>
              {needsYou(feature).length > 0 ? <StateDot state="needs-you" /> : null}
            </Stack>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 0.5, pl: 3 }}>
              <Typography color="text.secondary" sx={{ flex: 1 }} variant="caption">
                {feature.sessions.length} sessions · {new Set(feature.sessions.map(session => session.cwd)).size} cwds
              </Typography>
              {feature.mission === undefined ? null : <MissionProgress mission={feature.mission} width={48} />}
            </Stack>
          </Box>
        );
      })}
      <Button size="small" startIcon={<LucideMuiIcon fontSize="small" icon={Plus} />} sx={{ m: 1 }}>
        New Feature
      </Button>
    </Box>
    <Typography color="text.secondary" sx={{ borderColor: 'divider', borderTop: 1, p: 2 }} variant="caption">
      {ctx.ungroupedCount} live sessions are in no Feature.
    </Typography>
  </Box>
);

const Legend: FC = () => {
  const theme = useTheme();
  const item = (label: string, color: string, dash?: string) => (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
      <svg height="6" width="24">
        <line stroke={color} strokeDasharray={dash} strokeWidth="2" x1="0" x2="24" y1="3" y2="3" />
      </svg>
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
    </Stack>
  );
  return (
    <Stack direction="row" spacing={2}>
      {item('Handoff', theme.palette.primary.main)}
      {item('Mission spawn', theme.palette.text.disabled, '6 4')}
      {item('Fix from validation', theme.palette.error.main, '2 4')}
    </Stack>
  );
};

export const VariantCLanes: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const { feature } = ctx;
  return (
    <Box sx={theme => ({ ...allotmentSashSx(theme), bgcolor: 'background.default', height: '100%' })}>
      <Allotment>
        <Allotment.Pane minSize={180} preferredSize={240}>
          <FeatureList ctx={ctx} />
        </Allotment.Pane>
        <Allotment.Pane minSize={400}>
          <Allotment vertical>
            <Allotment.Pane minSize={160}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <Stack
                  direction="row"
                  sx={{ alignItems: 'center', flexShrink: 0, gap: 2, height: PANEL_HEADER_HEIGHT, px: 2 }}
                >
                  <Typography noWrap sx={{ flex: 1 }} variant="h6">
                    {feature.name}
                  </Typography>
                  <Legend />
                </Stack>
                {feature.mission?.state === 'halted' ? (
                  <Alert severity="error" sx={{ flexShrink: 0, mx: 2 }}>
                    {feature.mission.haltReason}
                  </Alert>
                ) : null}
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <Lanes ctx={ctx} />
                </Box>
              </Box>
            </Allotment.Pane>
            <Allotment.Pane minSize={160} preferredSize={340}>
              <Box sx={{ borderColor: 'divider', borderTop: 1, height: '100%' }}>
                <SessionPane
                  empty={
                    <Typography color="text.secondary" variant="body2">
                      Click a node to open its chat here.
                    </Typography>
                  }
                  onClientError={ctx.onClientError}
                  session={ctx.focused}
                />
              </Box>
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
