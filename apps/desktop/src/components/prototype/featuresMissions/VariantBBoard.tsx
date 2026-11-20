/**
 * PROTOTYPE variant B — "Mission Control board": the Feature overview is primary and chat is a drill-in. Features are
 * top tabs; a cross-Feature "Needs you" inbox sits above a board (Mission: one column per milestone; plain Feature:
 * one column per cwd). Clicking a card opens its chat in a side pane.
 */
import { AgentLaunchTargetIcon, allotmentSashSx, IconTooltipButton, LucideMuiIcon, PANEL_HEADER_HEIGHT } from '@lib/ui';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { Allotment } from 'allotment';
import { ArrowLeft, Bell, Layers, PanelRightClose, Plus, Rocket } from 'lucide-react';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import { needsYou, sessionByKey } from './featuresMissionsFixtures.ts';
import type { Feature, ProtoSession, Task } from './featuresMissionsFixtures.ts';
import {
  cwdCaption,
  MissionProgress,
  RoleChip,
  SessionPane,
  SeverityChip,
  STATE_COLOR,
  STATE_LABEL,
  StateDot,
} from './featuresMissionsShared.tsx';
import type { PrototypeContext } from './featuresMissionsShared.tsx';

const Column: FC<{ readonly children: ReactNode; readonly header: ReactNode }> = ({ children, header }) => (
  <Box
    sx={{
      bgcolor: 'action.hover',
      borderRadius: 1,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      maxHeight: '100%',
      minHeight: 0,
      width: 280,
    }}
  >
    <Box sx={{ flexShrink: 0, p: 1.5 }}>{header}</Box>
    <Stack spacing={1} sx={{ minHeight: 0, overflow: 'auto', pb: 1.5, px: 1.5 }}>
      {children}
    </Stack>
  </Box>
);

const Card: FC<{
  readonly ctx: PrototypeContext;
  readonly session: ProtoSession | undefined;
  readonly task?: Task;
}> = ({ ctx, session, task }) => {
  const state = task?.state ?? session?.state ?? 'planned';
  const selected = session !== undefined && ctx.focused?.key === session.key;
  return (
    <Paper
      onClick={() => {
        if (session !== undefined) ctx.openSession(session);
      }}
      sx={{
        borderLeft: 3,
        borderLeftColor: STATE_COLOR[state],
        cursor: session === undefined ? 'default' : 'pointer',
        opacity: session === undefined ? 0.6 : 1,
        outline: selected ? 2 : 0,
        outlineColor: 'primary.main',
        p: 1.25,
      }}
      variant="outlined"
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        {task?.fixOf === undefined ? null : (
          <Chip color="error" label="Fix" size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
        )}
        <Typography sx={{ flex: 1, fontWeight: 600 }} variant="body2">
          {task?.title ?? session?.title}
        </Typography>
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
        <StateDot state={state} />
        <Typography color="text.secondary" sx={{ flex: 1 }} variant="caption">
          {STATE_LABEL[state]}
        </Typography>
        {session === undefined ? (
          <Typography color="text.disabled" variant="caption">
            No session yet
          </Typography>
        ) : (
          <>
            {session.role === 'worker' ? null : <RoleChip role={session.role} />}
            <Typography color="text.secondary" variant="caption">
              {cwdCaption(session.cwd)}
            </Typography>
            <AgentLaunchTargetIcon launchTarget={session.launchTarget} />
          </>
        )}
      </Stack>
      {session?.from?.via === 'handoff' ? (
        <Typography color="text.secondary" sx={{ display: 'block', mt: 0.5 }} variant="caption">
          ⇢ handed off from “{sessionByKey(ctx.feature, session.from.key)?.title}”
        </Typography>
      ) : null}
    </Paper>
  );
};

const MissionBoard: FC<{ readonly ctx: PrototypeContext; readonly feature: Feature }> = ({ ctx, feature }) => {
  const mission = feature.mission!;
  const manual = feature.sessions.filter(session => session.role === 'manual');
  return (
    <>
      {mission.milestones.map(milestone => (
        <Column
          header={
            <>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <StateDot state={milestone.state} />
                <Typography sx={{ flex: 1, fontWeight: 600 }} variant="subtitle2">
                  {milestone.title}
                </Typography>
                <Chip
                  label={milestone.round > 0 ? `Round ${milestone.round}` : STATE_LABEL[milestone.state]}
                  size="small"
                  sx={{ fontSize: '0.65rem', height: 18 }}
                />
              </Stack>
              {milestone.findings.map(finding => (
                <Stack direction="row" key={finding.text} sx={{ alignItems: 'flex-start', gap: 1, mt: 0.75 }}>
                  <SeverityChip severity={finding.severity} />
                  <Typography color="text.secondary" variant="caption">
                    {finding.text}
                  </Typography>
                </Stack>
              ))}
            </>
          }
          key={milestone.id}
        >
          {mission.tasks
            .filter(task => task.milestoneId === milestone.id)
            .map(task => (
              <Card ctx={ctx} key={task.id} session={sessionByKey(feature, task.sessionKey)} task={task} />
            ))}
          {feature.sessions
            .filter(session => session.role === 'validator' && session.milestoneId === milestone.id)
            .map(session => (
              <Card ctx={ctx} key={session.key} session={session} />
            ))}
        </Column>
      ))}
      <Column
        header={
          <Typography sx={{ fontWeight: 600 }} variant="subtitle2">
            Added by you
          </Typography>
        }
      >
        {manual.map(session => (
          <Card ctx={ctx} key={session.key} session={session} />
        ))}
        <Button size="small" startIcon={<LucideMuiIcon fontSize="small" icon={Plus} />}>
          New session in this Feature
        </Button>
      </Column>
    </>
  );
};

const CwdBoard: FC<{ readonly ctx: PrototypeContext; readonly feature: Feature }> = ({ ctx, feature }) => {
  const cwds = [...new Set(feature.sessions.map(session => session.cwd))];
  return (
    <>
      {cwds.map(cwd => (
        <Column
          header={
            <Typography sx={{ fontWeight: 600 }} title={cwd} variant="subtitle2">
              {cwdCaption(cwd)}
            </Typography>
          }
          key={cwd}
        >
          {feature.sessions
            .filter(session => session.cwd === cwd)
            .map(session => (
              <Card ctx={ctx} key={session.key} session={session} />
            ))}
        </Column>
      ))}
      <Column
        header={
          <Typography color="text.secondary" variant="subtitle2">
            Another Project…
          </Typography>
        }
      >
        <Button size="small" startIcon={<LucideMuiIcon fontSize="small" icon={Plus} />}>
          New session in this Feature
        </Button>
      </Column>
    </>
  );
};

const NeedsYouInbox: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const items = ctx.features.flatMap(feature => needsYou(feature).map(session => ({ feature, session })));
  return (
    <Stack
      direction="row"
      sx={{ alignItems: 'center', borderBottom: 1, borderColor: 'divider', flexShrink: 0, gap: 1, px: 2, py: 1 }}
    >
      <LucideMuiIcon icon={Bell} sx={{ color: 'warning.main', fontSize: '1rem' }} />
      <Typography color="text.secondary" variant="caption">
        Needs you
      </Typography>
      {items.map(({ feature, session }) => (
        <Chip
          color="warning"
          key={session.key}
          label={`${feature.name} · ${session.transcript.at(-1)?.kind === 'halt' ? 'Mission halted' : session.title}`}
          onClick={() => {
            ctx.selectFeature(feature.id);
            ctx.openSession(session);
          }}
          size="small"
          variant="outlined"
        />
      ))}
    </Stack>
  );
};

export const VariantBBoard: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const navigate = useNavigate();
  // Closing hides the chat for that session only; opening another card brings it back.
  const [closedKey, setClosedKey] = useState<string | undefined>(undefined);
  const { feature } = ctx;
  const orchestrator =
    feature.mission === undefined ? undefined : sessionByKey(feature, feature.mission.orchestratorKey);
  return (
    <Box
      sx={theme => ({
        ...allotmentSashSx(theme),
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      })}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
          gap: 1,
          height: PANEL_HEADER_HEIGHT,
          px: 1,
        }}
      >
        <IconTooltipButton
          icon={ArrowLeft}
          label="Back to chat"
          onClick={() => {
            navigate({ to: '/' }).catch(() => undefined);
          }}
        />
        <Tabs
          onChange={(_event, id: string) => {
            ctx.selectFeature(id);
          }}
          sx={{ flex: 1, minHeight: 0 }}
          value={feature.id}
          variant="scrollable"
        >
          {ctx.features.map(candidate => (
            <Tab
              icon={
                <Badge badgeContent={needsYou(candidate).length} color="warning">
                  <LucideMuiIcon icon={candidate.mission === undefined ? Layers : Rocket} sx={{ fontSize: '1rem' }} />
                </Badge>
              }
              iconPosition="start"
              key={candidate.id}
              label={candidate.name}
              sx={{ minHeight: PANEL_HEADER_HEIGHT, textTransform: 'none' }}
              value={candidate.id}
            />
          ))}
        </Tabs>
        <Button size="small" startIcon={<LucideMuiIcon fontSize="small" icon={Plus} />}>
          New Feature
        </Button>
      </Stack>
      <NeedsYouInbox ctx={ctx} />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Allotment>
          <Allotment.Pane minSize={400}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 2, px: 2, py: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6">{feature.name}</Typography>
                  <Typography color="text.secondary" variant="body2">
                    {feature.mission?.brief ?? feature.description}
                  </Typography>
                </Box>
                {feature.mission === undefined ? (
                  <Typography color="text.secondary" variant="caption">
                    {ctx.ungroupedCount} other live sessions hidden
                  </Typography>
                ) : (
                  <>
                    <MissionProgress mission={feature.mission} width={120} />
                    <Button
                      onClick={() => {
                        if (orchestrator !== undefined) ctx.openSession(orchestrator);
                        setClosedKey(undefined);
                      }}
                      size="small"
                      variant="outlined"
                    >
                      Orchestrator
                    </Button>
                    <Button size="small" variant="outlined">
                      {feature.mission.state === 'halted' ? 'Resume' : 'Pause'}
                    </Button>
                  </>
                )}
              </Stack>
              {feature.mission?.state === 'halted' ? (
                <Alert severity="error" sx={{ flexShrink: 0, mx: 2 }}>
                  {feature.mission.haltReason}
                </Alert>
              ) : null}
              <Box sx={{ display: 'flex', flex: 1, gap: 1.5, minHeight: 0, overflowX: 'auto', p: 2 }}>
                {feature.mission === undefined ? (
                  <CwdBoard ctx={ctx} feature={feature} />
                ) : (
                  <MissionBoard ctx={ctx} feature={feature} />
                )}
              </Box>
            </Box>
          </Allotment.Pane>
          <Allotment.Pane
            minSize={320}
            preferredSize={460}
            visible={ctx.focused !== undefined && ctx.focused.key !== closedKey}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              <Box sx={{ display: 'flex', flexShrink: 0, justifyContent: 'flex-end', px: 1, pt: 0.5 }}>
                <IconTooltipButton
                  icon={PanelRightClose}
                  label="Close chat"
                  onClick={() => {
                    setClosedKey(ctx.focused?.key);
                  }}
                />
              </Box>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <SessionPane onClientError={ctx.onClientError} session={ctx.focused} />
              </Box>
            </Box>
          </Allotment.Pane>
        </Allotment>
      </Box>
    </Box>
  );
};
