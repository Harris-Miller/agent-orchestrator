/**
 * PROTOTYPE variant A — "Rail tab": chat stays primary. The nav rail gets a Sessions | Features switch; a Feature is an
 * accordion of its sessions across cwds, and a Mission adds a right-hand panel (where Session state lives today).
 */
import { allotmentSashSx, LucideMuiIcon, PANEL_HEADER_HEIGHT } from '@lib/ui';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { Layers, Rocket } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { WorkbenchNavRail } from '../../workbenchNavRail/WorkbenchNavRail.tsx';

import { needsYou, sessionByKey } from './featuresMissionsFixtures.ts';
import type { Feature, ProtoSession } from './featuresMissionsFixtures.ts';
import {
  MissionProgress,
  ProtoSessionRow,
  RealChatPane,
  SessionPane,
  SeverityChip,
  STATE_LABEL,
  StateDot,
} from './featuresMissionsShared.tsx';
import type { PrototypeContext } from './featuresMissionsShared.tsx';

const depth = (feature: Feature, session: ProtoSession): number =>
  session.from?.via !== 'handoff'
    ? 0
    : 1 + depth(feature, sessionByKey(feature, session.from.key) ?? { ...session, from: undefined });

const FeatureRows: FC<{ readonly ctx: PrototypeContext; readonly feature: Feature }> = ({ ctx, feature }) => {
  const row = (session: ProtoSession, indent = 0) => (
    <ProtoSessionRow
      indent={indent}
      key={session.key}
      onOpen={() => {
        ctx.selectFeature(feature.id);
        ctx.openSession(session);
      }}
      selected={ctx.focused?.key === session.key}
      session={session}
    />
  );
  const { mission } = feature;
  if (mission === undefined) return <>{feature.sessions.map(session => row(session, depth(feature, session)))}</>;
  const orchestrator = sessionByKey(feature, mission.orchestratorKey);
  return (
    <>
      {orchestrator === undefined ? null : row(orchestrator)}
      {mission.milestones.map(milestone => {
        const sessions = feature.sessions.filter(session => session.milestoneId === milestone.id);
        return (
          <Box key={milestone.id}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, pl: 2, pr: 1, pt: 0.75 }}>
              <StateDot state={milestone.state} />
              <Typography color="text.secondary" noWrap sx={{ flex: 1 }} variant="caption">
                {milestone.title}
              </Typography>
              <Typography color="text.secondary" variant="caption">
                {STATE_LABEL[milestone.state]}
                {milestone.round > 0 ? ` · r${milestone.round}` : ''}
              </Typography>
            </Stack>
            {sessions.length === 0 ? (
              <Typography color="text.disabled" sx={{ display: 'block', pl: 4, py: 0.25 }} variant="caption">
                No sessions yet
              </Typography>
            ) : (
              sessions.map(session => row(session, 1))
            )}
          </Box>
        );
      })}
      {feature.sessions
        .filter(session => session.role === 'manual')
        .map(session => (
          <Box key={session.key}>
            <Typography color="text.secondary" sx={{ display: 'block', pl: 2, pt: 0.75 }} variant="caption">
              Added by you
            </Typography>
            {row(session, 1)}
          </Box>
        ))}
    </>
  );
};

const FeaturesRail: FC<{ readonly ctx: PrototypeContext; readonly onShowSessions: () => void }> = ({
  ctx,
  onShowSessions,
}) => {
  const [focusMode, setFocusMode] = useState(false);
  const shown = focusMode ? [ctx.feature] : ctx.features;
  return (
    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ flexShrink: 0, pt: 1, px: 1 }}>
        <ListItemButton sx={{ borderRadius: 1, py: 0.75 }}>
          <ListItemIcon sx={{ color: 'text.secondary', minWidth: 32 }}>
            <LucideMuiIcon fontSize="small" icon={Layers} />
          </ListItemIcon>
          <ListItemText primary="New Feature" slotProps={{ primary: { variant: 'body2' } }} />
        </ListItemButton>
        <ListItemButton sx={{ borderRadius: 1, py: 0.75 }}>
          <ListItemIcon sx={{ color: 'text.secondary', minWidth: 32 }}>
            <LucideMuiIcon fontSize="small" icon={Rocket} />
          </ListItemIcon>
          <ListItemText primary="New Mission" slotProps={{ primary: { variant: 'body2' } }} />
        </ListItemButton>
        <FormControlLabel
          control={
            <Switch
              checked={focusMode}
              onChange={(_event, checked) => {
                setFocusMode(checked);
              }}
              size="small"
            />
          }
          label={<Typography variant="body2">Focus: only “{ctx.feature.name}”</Typography>}
          sx={{ ml: 1 }}
        />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', py: 0.5 }}>
        {shown.map(feature => (
          <Accordion
            disableGutters
            expanded={focusMode || feature.id === ctx.feature.id}
            key={feature.id}
            onChange={() => {
              ctx.selectFeature(feature.id);
            }}
            sx={{ bgcolor: 'transparent', borderBottom: 0 }}
          >
            <AccordionSummary
              sx={{
                '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1, m: 0, minWidth: 0 },
                minHeight: 0,
                px: 2,
                py: 1,
              }}
            >
              <Badge badgeContent={needsYou(feature).length} color="warning">
                <LucideMuiIcon
                  icon={feature.mission === undefined ? Layers : Rocket}
                  sx={{ color: 'text.secondary', fontSize: '1rem' }}
                />
              </Badge>
              <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="body2">
                {feature.name}
              </Typography>
              {feature.mission === undefined ? (
                <Typography color="text.secondary" variant="caption">
                  {feature.sessions.length}
                </Typography>
              ) : (
                <MissionProgress mission={feature.mission} width={56} />
              )}
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <FeatureRows ctx={ctx} feature={feature} />
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
      <Box
        onClick={onShowSessions}
        role="button"
        sx={{ borderColor: 'divider', borderTop: 1, cursor: 'pointer', flexShrink: 0, px: 2, py: 1 }}
      >
        <Typography color="text.secondary" variant="caption">
          {ctx.ungroupedCount} History sessions are in no Feature. Open the Sessions tab ›
        </Typography>
      </Box>
    </Box>
  );
};

export const MissionPanel: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const { mission } = ctx.feature;
  if (mission === undefined) return null;
  const orchestrator = sessionByKey(ctx.feature, mission.orchestratorKey);
  return (
    <Box sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, height: PANEL_HEADER_HEIGHT, px: 2 }}>
        <Typography variant="h6">Mission</Typography>
      </Box>
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
        <Typography variant="body2">{mission.brief}</Typography>
        {mission.state === 'halted' ? (
          <Alert
            action={
              orchestrator === undefined ? undefined : (
                <Button
                  onClick={() => {
                    ctx.openSession(orchestrator);
                  }}
                  size="small"
                >
                  Take over
                </Button>
              )
            }
            severity="error"
          >
            {mission.haltReason}
          </Alert>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined">
              Pause
            </Button>
            <Button
              onClick={() => {
                if (orchestrator !== undefined) ctx.openSession(orchestrator);
              }}
              size="small"
            >
              Talk to orchestrator
            </Button>
          </Stack>
        )}
        {mission.milestones.map(milestone => (
          <Box key={milestone.id}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <StateDot state={milestone.state} />
              <Typography sx={{ flex: 1, fontWeight: 600 }} variant="body2">
                {milestone.title}
              </Typography>
              <Typography color="text.secondary" variant="caption">
                {milestone.round > 0 ? `Round ${milestone.round}` : STATE_LABEL[milestone.state]}
              </Typography>
            </Stack>
            {mission.tasks
              .filter(task => task.milestoneId === milestone.id)
              .map(task => (
                <Stack direction="row" key={task.id} sx={{ alignItems: 'center', gap: 1, pl: 2, pt: 0.5 }}>
                  <StateDot state={task.state} />
                  <Typography color={task.fixOf === undefined ? undefined : 'error'} noWrap variant="caption">
                    {task.title}
                  </Typography>
                </Stack>
              ))}
            {milestone.findings.map(finding => (
              <Stack direction="row" key={finding.text} sx={{ alignItems: 'flex-start', gap: 1, pl: 2, pt: 0.5 }}>
                <SeverityChip severity={finding.severity} />
                <Typography color="text.secondary" variant="caption">
                  {finding.text}
                </Typography>
              </Stack>
            ))}
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export type RailTab = 'features' | 'sessions';

/** The Sessions | Features rail; also used by the A+C variants. */
export const RailPane: FC<{
  readonly ctx: PrototypeContext;
  readonly onTabChange: (tab: RailTab) => void;
  readonly tab: RailTab;
}> = ({ ctx, onTabChange, tab }) => (
  <Box sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <Tabs
      onChange={(_event, value: RailTab) => {
        onTabChange(value);
      }}
      sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      value={tab}
      variant="fullWidth"
    >
      <Tab label="Sessions" value="sessions" />
      <Tab label="Features" value="features" />
    </Tabs>
    {tab === 'sessions' ? (
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <WorkbenchNavRail onClientError={ctx.onClientError} onClose={() => undefined} />
      </Box>
    ) : (
      <FeaturesRail
        ctx={ctx}
        onShowSessions={() => {
          onTabChange('sessions');
        }}
      />
    )}
  </Box>
);

export const VariantARailTab: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const [tab, setTab] = useState<RailTab>('features');
  return (
    <Box sx={theme => ({ ...allotmentSashSx(theme), bgcolor: 'background.default', height: '100%' })}>
      <Allotment>
        <Allotment.Pane minSize={260} preferredSize={380}>
          <RailPane ctx={ctx} onTabChange={setTab} tab={tab} />
        </Allotment.Pane>
        <Allotment.Pane minSize={320}>
          {tab === 'sessions' ? (
            <RealChatPane onClientError={ctx.onClientError} />
          ) : (
            <SessionPane onClientError={ctx.onClientError} session={ctx.focused} />
          )}
        </Allotment.Pane>
        {tab === 'features' && ctx.feature.mission !== undefined ? (
          <Allotment.Pane minSize={240} preferredSize={320}>
            <MissionPanel ctx={ctx} />
          </Allotment.Pane>
        ) : null}
      </Allotment>
    </Box>
  );
};
