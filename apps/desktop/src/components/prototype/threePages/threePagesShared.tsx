/** PROTOTYPE (Epic #424): in-memory store and small pieces every page/variant renders. Layout stays in each variant. */
import { AgentLaunchTargetIcon, directoryBasename, PANEL_HEADER_HEIGHT } from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import { ORCHESTRATIONS, SESSIONS_PAGE_POOL, WORKSTREAMS } from './threePagesFixtures.ts';
import type {
  NodeState,
  Orchestration,
  OSession,
  Role,
  RunState,
  StubLine,
  Task,
  TrackerRef,
  Workstream,
  WSession,
} from './threePagesFixtures.ts';

// ---------- store ----------

export type Store = {
  readonly orchestrations: readonly Orchestration[];
  readonly workstreams: readonly Workstream[];
  /** Stand-ins for Sessions Page sessions: what a Workstream can adopt and where orphans go. */
  readonly pool: readonly WSession[];
  /** Global setting: "Stop at each milestone" default for new Orchestrations. */
  readonly defaultStopAtMilestones: boolean;
};

const mapOrch = (store: Store, id: string, f: (orch: Orchestration) => Orchestration): Store => ({
  ...store,
  orchestrations: store.orchestrations.map(orch => (orch.id === id ? f(orch) : orch)),
});
const mapSession = (orch: Orchestration, key: string, f: (session: OSession) => OSession): Orchestration => ({
  ...orch,
  sessions: orch.sessions.map(session => (session.key === key ? f(session) : session)),
});
const say = (session: OSession, ...lines: StubLine[]): OSession => ({
  ...session,
  transcript: [...session.transcript, ...lines],
});
const mapWs = (store: Store, id: string, f: (ws: Workstream) => Workstream): Store => ({
  ...store,
  workstreams: store.workstreams.map(ws => (ws.id === id ? f(ws) : ws)),
});

export const useStore = () => {
  const [store, setStore] = useState<Store>({
    defaultStopAtMilestones: true,
    orchestrations: ORCHESTRATIONS,
    pool: SESSIONS_PAGE_POOL,
    workstreams: WORKSTREAMS,
  });
  const update = (f: (current: Store) => Store) => {
    setStore(f);
  };
  const actions = {
    adopt: (wsId: string, key: string) => {
      update(current => {
        const session = current.pool.find(candidate => candidate.key === key);
        if (session === undefined) return current;
        return mapWs({ ...current, pool: current.pool.filter(candidate => candidate.key !== key) }, wsId, ws => ({
          ...ws,
          sessions: [...ws.sessions, session],
        }));
      });
    },
    addTracker: (wsId: string, ref: TrackerRef) => {
      update(current => mapWs(current, wsId, ws => ({ ...ws, trackers: [...ws.trackers, ref] })));
    },
    complete: (id: string, done: boolean) => {
      update(current =>
        mapOrch(current, id, orch => ({
          ...orch,
          gateMilestoneId: undefined,
          runState: done ? 'completed' : 'paused',
        })),
      );
    },
    continueGate: (id: string, feedback: string) => {
      update(current =>
        mapOrch(current, id, orch => {
          const index = orch.milestones.findIndex(milestone => milestone.id === orch.gateMilestoneId);
          const next = orch.milestones[index + 1];
          if (next === undefined) return { ...orch, gateMilestoneId: undefined, runState: 'completed' };
          const extra: readonly Task[] =
            feedback.trim() === ''
              ? []
              : [
                  {
                    fromFeedback: true,
                    id: `fb-${Date.now()}`,
                    milestoneId: next.id,
                    title: `From your feedback: ${feedback.trim()}`,
                  },
                ];
          const tasks = [...orch.tasks, ...extra].map(task =>
            task.milestoneId === next.id && task.sessionKey === undefined
              ? { ...task, sessionKey: `w-${task.id}` }
              : task,
          );
          const started = tasks
            .filter(
              task => task.milestoneId === next.id && !orch.sessions.some(session => session.key === task.sessionKey),
            )
            .map((task): OSession => ({
              cwd: orch.sessions[0]?.cwd ?? '',
              key: task.sessionKey ?? task.id,
              launchTarget: 'codex-acp',
              milestoneId: next.id,
              queue: [],
              role: 'worker',
              state: 'running',
              title: task.title,
              transcript: [{ kind: 'user', text: `Task: ${task.title}` }],
            }));
          const revised = mapSession(orch, orch.orchestratorKey, session =>
            say(
              { ...session, state: 'running' },
              ...(feedback.trim() === '' ? [] : [{ kind: 'user' as const, text: feedback.trim() }]),
              {
                kind: 'agent',
                text:
                  extra.length > 0
                    ? `Revised ${next.title}: added “${extra[0]?.title}”. Starting it.`
                    : `No changes. Starting ${next.title}.`,
              },
            ),
          );
          return {
            ...revised,
            gateMilestoneId: undefined,
            milestones: orch.milestones.map(milestone =>
              milestone.id === next.id ? { ...milestone, state: 'running' } : milestone,
            ),
            runState: 'running',
            sessions: [...revised.sessions, ...started],
            tasks,
          };
        }),
      );
    },
    dequeue: (id: string, key: string, index: number) => {
      update(current =>
        mapOrch(current, id, orch =>
          mapSession(orch, key, session => ({ ...session, queue: session.queue.filter((_, at) => at !== index) })),
        ),
      );
    },
    enqueue: (id: string, key: string, text: string) => {
      update(current =>
        mapOrch(current, id, orch =>
          mapSession(orch, key, session => ({ ...session, queue: [...session.queue, text] })),
        ),
      );
    },
    guide: (id: string, key: string, text: string) => {
      update(current =>
        mapOrch(current, id, orch =>
          mapSession(orch, key, session =>
            say(
              { ...session, state: 'running' },
              { kind: 'user', text },
              { kind: 'agent', text: '(stub) Got it, adjusting.' },
            ),
          ),
        ),
      );
    },
    interrupt: (id: string, key: string) => {
      update(current =>
        mapOrch(current, id, orch =>
          mapSession(orch, key, session =>
            say({ ...session, state: 'paused' }, { kind: 'note', text: '⏹ You interrupted this session.' }),
          ),
        ),
      );
    },
    newOrchestration: () => {
      update(current => ({
        ...current,
        orchestrations: [
          {
            brief: 'New plan, drafted with the Orchestrator.',
            id: `new-${Date.now()}`,
            milestones: [],
            orchestratorKey: 'new-orch',
            runState: 'drafting',
            sessions: [
              {
                cwd: '/Users/you/Projects/agent-orchestrator',
                key: 'new-orch',
                launchTarget: 'claude-agent-acp',
                queue: [],
                role: 'orchestrator',
                state: 'waiting',
                title: 'Orchestrator · New Orchestration',
                transcript: [{ kind: 'agent', text: 'What should we build? Paste a plan or describe the goal.' }],
              },
            ],
            stopAtMilestones: current.defaultStopAtMilestones,
            tasks: [],
            title: 'New Orchestration',
          },
          ...current.orchestrations,
        ],
      }));
    },
    newWorkstream: (name: string) => {
      update(current => ({
        ...current,
        workstreams: [
          { archived: false, id: `ws-${Date.now()}`, name, sessions: [], trackers: [] },
          ...current.workstreams,
        ],
      }));
    },
    orphan: (wsId: string, key: string) => {
      update(current => {
        const session = current.workstreams
          .find(ws => ws.id === wsId)
          ?.sessions.find(candidate => candidate.key === key);
        if (session === undefined) return current;
        return mapWs({ ...current, pool: [...current.pool, session] }, wsId, ws => ({
          ...ws,
          sessions: ws.sessions.filter(candidate => candidate.key !== key),
        }));
      });
    },
    pause: (id: string, paused: boolean) => {
      update(current =>
        mapOrch(current, id, orch => ({
          ...orch,
          runState: paused ? 'paused' : 'running',
          sessions: orch.sessions.map(session =>
            paused && session.state === 'running'
              ? { ...session, state: 'paused' }
              : !paused && session.state === 'paused'
                ? { ...session, state: 'running' }
                : session,
          ),
        })),
      );
    },
    setDefaultStopAtMilestones: (value: boolean) => {
      update(current => ({ ...current, defaultStopAtMilestones: value }));
    },
    setStopAtMilestones: (id: string, value: boolean) => {
      update(current => mapOrch(current, id, orch => ({ ...orch, stopAtMilestones: value })));
    },
    toggleSessionArchived: (wsId: string, key: string) => {
      update(current =>
        mapWs(current, wsId, ws => ({
          ...ws,
          sessions: ws.sessions.map(session =>
            session.key === key ? { ...session, archived: !session.archived } : session,
          ),
        })),
      );
    },
    toggleWorkstreamArchived: (wsId: string) => {
      update(current =>
        mapWs(current, wsId, ws => ({
          ...ws,
          archived: !ws.archived,
          // Archive cascades to every session; unarchive restores them all.
          sessions: ws.sessions.map(session => ({ ...session, archived: !ws.archived })),
        })),
      );
    },
  };
  return { actions, store };
};

export type StoreApi = ReturnType<typeof useStore>;

// ---------- small pieces ----------

export const NODE_COLOR: Readonly<Record<NodeState, string>> = {
  failed: 'error.main',
  finished: 'success.main',
  'not-started': 'text.disabled',
  paused: 'text.secondary',
  running: 'info.main',
  waiting: 'warning.main',
};

export const NODE_LABEL: Readonly<Record<NodeState, string>> = {
  failed: 'Failed',
  finished: 'Finished',
  'not-started': 'Not started',
  paused: 'Paused',
  running: 'Running',
  waiting: 'Waiting on you',
};

export const NodeDot: FC<{ readonly state: NodeState; readonly size?: number }> = ({ size = 8, state }) => (
  <Box
    aria-label={NODE_LABEL[state]}
    sx={{
      bgcolor: state === 'not-started' || state === 'paused' ? 'transparent' : NODE_COLOR[state],
      border: state === 'not-started' || state === 'paused' ? '1.5px solid' : 0,
      borderColor: NODE_COLOR[state],
      borderRadius: '50%',
      flexShrink: 0,
      height: size,
      width: size,
    }}
    title={NODE_LABEL[state]}
  />
);

const RUN_LABEL: Readonly<Record<RunState, string>> = {
  completed: 'Completed',
  drafting: 'Drafting plan',
  gated: 'Stopped at milestone',
  halted: 'Halted',
  paused: 'Paused',
  running: 'Running',
};
const RUN_COLOR: Readonly<Record<RunState, 'default' | 'error' | 'info' | 'success' | 'warning'>> = {
  completed: 'success',
  drafting: 'default',
  gated: 'warning',
  halted: 'error',
  paused: 'default',
  running: 'info',
};

export const RunStateChip: FC<{ readonly state: RunState }> = ({ state }) => (
  <Chip color={RUN_COLOR[state]} label={RUN_LABEL[state]} size="small" sx={{ height: 20 }} variant="outlined" />
);

const ROLE_LABEL: Readonly<Record<Role, string>> = {
  orchestrator: 'Orchestrator',
  validator: 'Validator',
  worker: 'Worker',
};
export const RoleChip: FC<{ readonly role: Role }> = ({ role }) => (
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

export const needsYouCount = (orch: Orchestration): number =>
  orch.sessions.filter(session => session.state === 'waiting').length;

export const sessionByKey = (orch: Orchestration, key: string | undefined): OSession | undefined =>
  orch.sessions.find(session => session.key === key);

export const PanelTitle: FC<{ readonly children: ReactNode; readonly actions?: ReactNode }> = ({
  actions,
  children,
}) => (
  <Stack
    direction="row"
    sx={{
      alignItems: 'center',
      bgcolor: 'background.paper',
      flexShrink: 0,
      gap: 1,
      minHeight: PANEL_HEADER_HEIGHT,
      px: 2,
    }}
  >
    <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
      {children}
    </Typography>
    {actions}
  </Stack>
);

const LineView: FC<{ readonly line: StubLine }> = ({ line }) => {
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
  if (line.kind === 'note') {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center' }} variant="caption">
        {line.text}
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
  return <Alert severity={line.kind === 'gate' ? 'warning' : 'error'}>{line.text}</Alert>;
};

/** Pending queued messages for a session, removable. */
export const QueueList: FC<{ readonly onRemove: (index: number) => void; readonly queue: readonly string[] }> = ({
  onRemove,
  queue,
}) =>
  queue.length === 0 ? null : (
    <Stack spacing={0.5}>
      <Typography color="text.secondary" variant="caption">
        Queued for the next turn ({queue.length})
      </Typography>
      {queue.map((text, index) => (
        <Stack
          direction="row"
          key={text}
          sx={{ alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1, gap: 1, px: 1 }}
        >
          <Typography noWrap sx={{ flex: 1 }} variant="caption">
            {text}
          </Typography>
          <IconButton
            aria-label="Remove queued message"
            onClick={() => {
              onRemove(index);
            }}
            size="small"
          >
            ×
          </IconButton>
        </Stack>
      ))}
    </Stack>
  );

/** Steering Composer: Interrupt, Send now (guidance), Queue (delivered at next idle). Completed = read-only. */
export const SteeringComposer: FC<{
  readonly api: StoreApi;
  readonly compact?: boolean;
  readonly orch: Orchestration;
  readonly session: OSession;
}> = ({ api, compact = false, orch, session }) => {
  const [text, setText] = useState('');
  if (orch.runState === 'completed') {
    return (
      <Typography color="text.secondary" sx={{ p: 1 }} variant="caption">
        Completed: all sessions archived. Reopen the Orchestration to talk to them.
      </Typography>
    );
  }
  const busy = session.state === 'running';
  return (
    <Stack spacing={1}>
      <QueueList
        onRemove={index => {
          api.actions.dequeue(orch.id, session.key, index);
        }}
        queue={session.queue}
      />
      <TextField
        fullWidth
        multiline={!compact}
        onChange={event => {
          setText(event.target.value);
        }}
        placeholder={busy ? 'Guide it now, or queue for its next turn…' : 'Message this session…'}
        size="small"
        value={text}
      />
      <Stack direction="row" spacing={1}>
        <Button
          color="error"
          disabled={!busy}
          onClick={() => {
            api.actions.interrupt(orch.id, session.key);
          }}
          size="small"
          variant="outlined"
        >
          Interrupt
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          disabled={text.trim() === ''}
          onClick={() => {
            api.actions.enqueue(orch.id, session.key, text.trim());
            setText('');
          }}
          size="small"
        >
          Queue
        </Button>
        <Button
          disabled={text.trim() === ''}
          onClick={() => {
            api.actions.guide(orch.id, session.key, text.trim());
            setText('');
          }}
          size="small"
          variant="contained"
        >
          {busy ? 'Send now' : 'Send'}
        </Button>
      </Stack>
    </Stack>
  );
};

/** Chat for one Orchestration session: transcript + steering. */
export const OrchestrationChat: FC<{
  readonly api: StoreApi;
  readonly headerActions?: ReactNode;
  readonly orch: Orchestration;
  readonly session: OSession;
}> = ({ api, headerActions, orch, session }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        bgcolor: 'background.paper',
        flexShrink: 0,
        gap: 1,
        minHeight: PANEL_HEADER_HEIGHT,
        px: 2,
      }}
    >
      <AgentLaunchTargetIcon launchTarget={session.launchTarget} size={20} />
      <Typography noWrap sx={{ flex: 1 }} variant="h6">
        {session.title}
      </Typography>
      <NodeDot state={session.state} />
      <RoleChip role={session.role} />
      <Chip label={cwdCaption(session.cwd)} size="small" />
      {headerActions}
    </Stack>
    <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
      {session.transcript.map((line, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- prototype: transcripts can repeat lines
        <LineView key={`${index}:${line.kind}`} line={line} />
      ))}
    </Stack>
    <Box sx={{ flexShrink: 0, p: 2 }}>
      <SteeringComposer api={api} orch={orch} session={session} />
    </Box>
  </Box>
);

/** Per-Orchestration "Stop at each milestone" toggle. */
export const GateToggle: FC<{ readonly api: StoreApi; readonly orch: Orchestration }> = ({ api, orch }) => (
  <FormControlLabel
    control={
      <Switch
        checked={orch.stopAtMilestones}
        disabled={orch.runState === 'completed'}
        onChange={(_event, checked) => {
          api.actions.setStopAtMilestones(orch.id, checked);
        }}
        size="small"
      />
    }
    label={<Typography variant="body2">Stop at each milestone</Typography>}
  />
);

/** Run controls shared by every variant: Pause/Resume, Complete/Reopen. */
export const RunControls: FC<{ readonly api: StoreApi; readonly orch: Orchestration }> = ({ api, orch }) => (
  <Stack direction="row" spacing={1}>
    {orch.runState === 'running' || orch.runState === 'paused' ? (
      <Button
        onClick={() => {
          api.actions.pause(orch.id, orch.runState === 'running');
        }}
        size="small"
        variant="outlined"
      >
        {orch.runState === 'running' ? 'Pause' : 'Resume'}
      </Button>
    ) : null}
    <Button
      color={orch.runState === 'completed' ? 'inherit' : 'success'}
      onClick={() => {
        api.actions.complete(orch.id, orch.runState !== 'completed');
      }}
      size="small"
    >
      {orch.runState === 'completed' ? 'Reopen' : 'Complete'}
    </Button>
  </Stack>
);

/** The milestone-gate feedback step: test, write feedback, continue (the Orchestrator revises the next milestone). */
export const GateReview: FC<{ readonly api: StoreApi; readonly dense?: boolean; readonly orch: Orchestration }> = ({
  api,
  dense = false,
  orch,
}) => {
  const [feedback, setFeedback] = useState('');
  const milestone = orch.milestones.find(candidate => candidate.id === orch.gateMilestoneId);
  if (orch.runState !== 'gated' || milestone === undefined) return null;
  const next = orch.milestones[orch.milestones.indexOf(milestone) + 1];
  return (
    <Stack spacing={1}>
      <Typography sx={{ fontWeight: 600 }} variant="body2">
        “{milestone.title}” is done. Test it, then tell the Orchestrator what to change
        {next === undefined ? '.' : ` before “${next.title}”.`}
      </Typography>
      {dense ? null : (
        <Typography color="text.secondary" variant="caption">
          {orch.tasks.filter(task => task.milestoneId === milestone.id).length} tasks finished · validated on round{' '}
          {milestone.round}
        </Typography>
      )}
      <TextField
        minRows={dense ? 1 : 3}
        multiline
        onChange={event => {
          setFeedback(event.target.value);
        }}
        placeholder="e.g. The rail should show the Project as a caption, not a group header"
        size="small"
        value={feedback}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button
          onClick={() => {
            api.actions.continueGate(orch.id, '');
          }}
          size="small"
        >
          Continue as planned
        </Button>
        <Button
          disabled={feedback.trim() === ''}
          onClick={() => {
            api.actions.continueGate(orch.id, feedback);
          }}
          size="small"
          variant="contained"
        >
          Send feedback & continue
        </Button>
      </Stack>
    </Stack>
  );
};

/** Global setting stub: default for "Stop at each milestone" on new Orchestrations. */
export const GlobalGateDefault: FC<{ readonly api: StoreApi }> = ({ api }) => (
  <FormControlLabel
    control={
      <Switch
        checked={api.store.defaultStopAtMilestones}
        onChange={(_event, checked) => {
          api.actions.setDefaultStopAtMilestones(checked);
        }}
        size="small"
      />
    }
    label={
      <Typography color="text.secondary" variant="caption">
        Settings: new Orchestrations stop at each milestone
      </Typography>
    }
    sx={{ ml: 0 }}
  />
);

/** The plan as data rows: milestones in order, each with its task/validator nodes and a node state. */
export type PlanNode = {
  readonly id: string;
  readonly kind: 'task' | 'validator';
  readonly title: string;
  readonly state: NodeState;
  readonly session?: OSession;
  readonly fix: boolean;
  readonly fromFeedback: boolean;
};

export const planRows = (orch: Orchestration) =>
  orch.milestones.map(milestone => {
    const nodes: PlanNode[] = orch.tasks
      .filter(task => task.milestoneId === milestone.id)
      .map(task => {
        const session = sessionByKey(orch, task.sessionKey);
        return {
          fix: task.fixOf !== undefined,
          fromFeedback: task.fromFeedback === true,
          id: task.id,
          kind: 'task',
          session,
          state: session?.state ?? 'not-started',
          title: task.title,
        };
      });
    const validator = sessionByKey(orch, milestone.validatorKey);
    nodes.push({
      fix: false,
      fromFeedback: false,
      id: `${milestone.id}-validator`,
      kind: 'validator',
      session: validator,
      state: validator?.state ?? 'not-started',
      title: validator?.title ?? 'Validate',
    });
    return { milestone, nodes };
  });

/** Rule 5: the full prototype state for the current selection, one click away. */
export const StatePeek: FC<{ readonly value: unknown }> = ({ value }) => (
  <Box
    component="details"
    title="Prototype state"
    sx={{
      bgcolor: 'background.paper',
      border: 1,
      borderColor: 'divider',
      borderRadius: 1,
      bottom: 16,
      maxHeight: '60vh',
      maxWidth: 420,
      overflow: 'auto',
      left: 6,
      position: 'fixed',
      zIndex: 'tooltip',
    }}
  >
    <Box component="summary" sx={{ cursor: 'pointer', listStyle: 'none', px: 1.5, py: 0.5, typography: 'caption' }}>
      {'{ }'}
    </Box>
    <Box component="pre" sx={{ fontSize: 11, m: 0, p: 1.5 }}>
      {JSON.stringify(value, (key, inner: unknown) => (key === 'transcript' ? '…' : inner), 2)}
    </Box>
  </Box>
);

/** A simple Orchestration list for the left rail. */
export const OrchestrationList: FC<{
  readonly api: StoreApi;
  readonly onSelect: (id: string) => void;
  readonly selectedId: string;
}> = ({ api, onSelect, selectedId }) => (
  <Box sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <PanelTitle
      actions={
        <Button onClick={api.actions.newOrchestration} size="small">
          New
        </Button>
      }
    >
      Orchestrations
    </PanelTitle>
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {api.store.orchestrations.map(orch => {
        const selected = orch.id === selectedId;
        const waiting = needsYouCount(orch);
        return (
          <Box
            key={orch.id}
            onClick={() => {
              onSelect(orch.id);
            }}
            role="button"
            sx={{
              bgcolor: selected ? 'action.selected' : 'transparent',
              cursor: 'pointer',
              opacity: orch.runState === 'completed' ? 0.6 : 1,
              px: 2,
              py: 1,
              '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
            }}
          >
            <Typography noWrap sx={{ fontWeight: selected ? 600 : 400 }} variant="body2">
              {orch.title}
            </Typography>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 0.5 }}>
              <RunStateChip state={orch.runState} />
              {waiting > 0 && orch.runState !== 'gated' ? (
                <Typography color="warning.main" variant="caption">
                  {waiting} waiting on you
                </Typography>
              ) : null}
              <Box sx={{ display: 'flex', flex: 1, gap: '2px', justifyContent: 'flex-end' }}>
                {orch.milestones.map(milestone => (
                  <Box
                    key={milestone.id}
                    sx={{
                      bgcolor: NODE_COLOR[milestone.state],
                      borderRadius: 0.5,
                      height: 6,
                      opacity: milestone.state === 'not-started' ? 0.4 : 1,
                      width: 14,
                    }}
                    title={milestone.title}
                  />
                ))}
              </Box>
            </Stack>
          </Box>
        );
      })}
    </Box>
    <Box sx={{ borderColor: 'divider', borderTop: 1, px: 2, py: 1 }}>
      <GlobalGateDefault api={api} />
    </Box>
  </Box>
);
