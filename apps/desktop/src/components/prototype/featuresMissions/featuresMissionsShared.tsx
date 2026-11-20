/** PROTOTYPE (#185 + #28): small pieces every variant renders. Layout stays in each variant. */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  activateSessionAtomFn,
  AgentLaunchTargetIcon,
  directoryBasename,
  listedSessionHistoryAtom,
  PANEL_HEADER_HEIGHT,
  SessionChatBody,
  SessionHeader,
} from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { buildFeatures, sessionByKey } from './featuresMissionsFixtures.ts';
import type {
  Feature,
  Mission,
  ProtoSession,
  SessionRole,
  SessionState,
  Severity,
  StubLine,
  TaskState,
} from './featuresMissionsFixtures.ts';

export type PrototypeContext = {
  readonly features: readonly Feature[];
  readonly feature: Feature;
  readonly focused: ProtoSession | undefined;
  readonly onClientError: (error: unknown) => void;
  readonly openSession: (session: ProtoSession) => void;
  readonly selectFeature: (id: string) => void;
  readonly ungroupedCount: number;
};

export const usePrototypeContext = (onClientError: (error: unknown) => void): PrototypeContext => {
  const realEntries = useAtomValue(listedSessionHistoryAtom);
  const { features, ungrouped } = useMemo(() => buildFeatures(realEntries), [realEntries]);
  const [featureId, setFeatureId] = useState(features[0]?.id ?? '');
  const [focusedKey, setFocusedKey] = useState<string | undefined>(undefined);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const feature = features.find(candidate => candidate.id === featureId) ?? features[0];
  return {
    feature,
    features,
    focused: sessionByKey(feature, focusedKey),
    onClientError,
    openSession: session => {
      setFocusedKey(session.key);
      if (session.real !== undefined) {
        activateSession({ launchTarget: session.real.launchTarget, sessionId: session.real.sessionId }).catch(
          onClientError,
        );
      }
    },
    selectFeature: id => {
      setFeatureId(id);
      setFocusedKey(undefined);
    },
    ungroupedCount: ungrouped.length,
  };
};

export const STATE_COLOR: Readonly<Record<SessionState | TaskState, string>> = {
  done: 'success.main',
  failed: 'error.main',
  idle: 'text.disabled',
  'needs-you': 'warning.main',
  passed: 'success.main',
  planned: 'text.disabled',
  running: 'info.main',
  validating: 'secondary.main',
};

export const STATE_LABEL: Readonly<Record<SessionState | TaskState, string>> = {
  done: 'Done',
  failed: 'Failed',
  idle: 'Idle',
  'needs-you': 'Needs you',
  passed: 'Passed',
  planned: 'Planned',
  running: 'Running',
  validating: 'Validating',
};

export const StateDot: FC<{ readonly state: SessionState | TaskState }> = ({ state }) => (
  <Box
    aria-label={STATE_LABEL[state]}
    sx={{ bgcolor: STATE_COLOR[state], borderRadius: '50%', flexShrink: 0, height: 8, width: 8 }}
    title={STATE_LABEL[state]}
  />
);

const ROLE_LABEL: Readonly<Record<SessionRole, string>> = {
  manual: 'You',
  orchestrator: 'Orchestrator',
  validator: 'Validator',
  worker: 'Worker',
};

export const RoleChip: FC<{ readonly role: SessionRole }> = ({ role }) =>
  role === 'manual' ? null : (
    <Chip
      color={role === 'orchestrator' ? 'primary' : 'default'}
      label={ROLE_LABEL[role]}
      size="small"
      sx={{ fontSize: '0.65rem', height: 18 }}
      variant="outlined"
    />
  );

export const cwdCaption = (cwd: string): string =>
  cwd.includes('/.hoa/contextless/') ? 'contextless' : directoryBasename(cwd);

/** Dumb row: never feeds fixtures through SessionHistoryRow (that one fires real activate/archive/delete). */
export const ProtoSessionRow: FC<{
  readonly caption?: ReactNode;
  readonly indent?: number;
  readonly onOpen: () => void;
  readonly selected: boolean;
  readonly session: ProtoSession;
}> = ({ caption, indent = 0, onOpen, selected, session }) => (
  <Box
    onClick={onOpen}
    role="button"
    sx={{
      alignItems: 'center',
      bgcolor: selected ? 'action.selected' : 'transparent',
      borderLeft: 2,
      borderLeftColor: selected ? 'primary.main' : 'transparent',
      cursor: 'pointer',
      display: 'flex',
      gap: 0.75,
      pl: 1 + indent * 2,
      pr: 1,
      py: 0.5,
      '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
    }}
    tabIndex={0}
  >
    <StateDot state={session.state} />
    <AgentLaunchTargetIcon launchTarget={session.launchTarget} />
    <Stack sx={{ flex: 1, minWidth: 0 }}>
      <Typography noWrap sx={{ fontWeight: selected ? 600 : 400 }} variant="body2">
        {session.from === undefined ? null : (
          <Box component="span" sx={{ color: 'text.secondary', mr: 0.5 }}>
            {session.from.via === 'handoff' ? '⇢' : '↳'}
          </Box>
        )}
        {session.title}
      </Typography>
      <Typography color="text.secondary" noWrap variant="caption">
        {caption ?? cwdCaption(session.cwd)}
        {session.real === undefined ? null : ' · live session'}
      </Typography>
    </Stack>
    <RoleChip role={session.role} />
  </Box>
);

const StubLineView: FC<{ readonly line: StubLine }> = ({ line }) => {
  if (line.kind === 'user') {
    return (
      <Paper sx={{ alignSelf: 'flex-end', bgcolor: 'action.selected', maxWidth: '80%', px: 1.5, py: 1 }}>
        <Typography variant="body2">{line.text}</Typography>
      </Paper>
    );
  }
  if (line.kind === 'agent') return <Typography variant="body2">{line.text}</Typography>;
  if (line.kind === 'tool') {
    return (
      <Typography color="text.secondary" sx={{ fontFamily: 'monospace' }} variant="caption">
        ▸ {line.text}
      </Typography>
    );
  }
  if (line.kind === 'permission') {
    return (
      <Alert
        action={
          <Stack direction="row" spacing={1}>
            <Button size="small">Allow</Button>
            <Button size="small">Deny</Button>
          </Stack>
        }
        severity="warning"
      >
        {line.text}
      </Alert>
    );
  }
  return <Alert severity="error">{line.text}</Alert>;
};

const StubTranscript: FC<{ readonly session: ProtoSession }> = ({ session }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: 'background.paper',
        display: 'flex',
        flexShrink: 0,
        gap: 1,
        height: PANEL_HEADER_HEIGHT,
        px: 2,
      }}
    >
      <AgentLaunchTargetIcon launchTarget={session.launchTarget} size={20} />
      <Typography noWrap sx={{ flex: 1 }} variant="h6">
        {session.title}
      </Typography>
      <RoleChip role={session.role} />
      <Chip label={cwdCaption(session.cwd)} size="small" />
    </Box>
    <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
      {session.transcript.map(line => (
        <StubLineView key={`${line.kind}:${line.text}`} line={line} />
      ))}
    </Stack>
    <Box sx={{ flexShrink: 0, p: 2 }}>
      <TextField disabled fullWidth placeholder="Prototype: fixture sessions have no Composer" size="small" />
    </Box>
  </Box>
);

/** The real chat surface for whatever is Selected. */
export const RealChatPane: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: 'background.paper',
        display: 'flex',
        flexShrink: 0,
        height: PANEL_HEADER_HEIGHT,
        px: 2,
      }}
    >
      <SessionHeader onClientError={onClientError} titleProps={{ variant: 'h6' }} />
    </Box>
    <SessionChatBody onClientError={onClientError} />
  </Box>
);

/** Real chat for a live History entry; a stub transcript for fixtures. */
export const SessionPane: FC<{
  readonly empty?: ReactNode;
  readonly onClientError: (error: unknown) => void;
  readonly session: ProtoSession | undefined;
}> = ({ empty, onClientError, session }) => {
  if (session === undefined) {
    return (
      <Box sx={{ alignItems: 'center', display: 'flex', height: '100%', justifyContent: 'center', p: 3 }}>
        {empty ?? (
          <Typography color="text.secondary" variant="body2">
            Pick a session in this Feature.
          </Typography>
        )}
      </Box>
    );
  }
  return session.real === undefined ? (
    <StubTranscript session={session} />
  ) : (
    <RealChatPane onClientError={onClientError} />
  );
};

const SEVERITY_COLOR: Readonly<Record<Severity, 'error' | 'warning' | 'default'>> = {
  blocking: 'error',
  'non-blocking': 'warning',
  suggestion: 'default',
};

export const SeverityChip: FC<{ readonly severity: Severity }> = ({ severity }) => (
  <Chip
    color={SEVERITY_COLOR[severity]}
    label={severity}
    size="small"
    sx={{ fontSize: '0.65rem', height: 18 }}
    variant="outlined"
  />
);

/** One segment per milestone, coloured by its state. */
export const MissionProgress: FC<{ readonly mission: Mission; readonly width?: number }> = ({
  mission,
  width = 72,
}) => (
  <Box sx={{ display: 'flex', flexShrink: 0, gap: '2px', width }}>
    {mission.milestones.map(milestone => (
      <Box
        key={milestone.id}
        sx={{ bgcolor: STATE_COLOR[milestone.state], borderRadius: 0.5, flex: 1, height: 6 }}
        title={`${milestone.title}: ${STATE_LABEL[milestone.state]}${milestone.round > 0 ? ` (round ${milestone.round})` : ''}`}
      />
    ))}
  </Box>
);
