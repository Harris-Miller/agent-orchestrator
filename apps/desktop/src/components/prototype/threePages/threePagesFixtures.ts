/**
 * PROTOTYPE (Epic #424: Sessions / Workstreams / Orchestration pages, assuming #409). Throwaway: lives on
 * `prototype/185-28-features-missions`, never main.
 *
 * Fixture-only on purpose: the Workstreams and Orchestration pages own their sessions (#409), so nothing here is a
 * real History entry and nothing here can reach the Sessions Page. Every action mutates this in-memory state only.
 * Ownership: a session belongs to the Sessions Page, one Workstream, or one Orchestration. Workstreams adopt from and
 * orphan to the Sessions Page; Orchestration sessions never move and are archived only all together (Complete).
 */
import type { AgentLaunchTarget } from '@lib/ui';

export type StubLine = {
  readonly kind: 'user' | 'agent' | 'tool' | 'permission' | 'halt' | 'gate' | 'note';
  readonly text: string;
};

/** Graph node state (Epic #424): what the Orchestrator's plan graph shows for each node. */
export type NodeState = 'not-started' | 'running' | 'paused' | 'waiting' | 'finished' | 'failed';
export type Role = 'orchestrator' | 'worker' | 'validator';

export type OSession = {
  readonly key: string;
  readonly role: Role;
  readonly title: string;
  readonly cwd: string;
  readonly launchTarget: AgentLaunchTarget;
  readonly state: NodeState;
  readonly milestoneId?: string;
  readonly transcript: readonly StubLine[];
  /** Messages the user queued; delivered at the session's next idle point. */
  readonly queue: readonly string[];
};

export type Task = {
  readonly id: string;
  readonly milestoneId: string;
  readonly title: string;
  /** Worker session once started; absent = not started. */
  readonly sessionKey?: string;
  /** A fix task the Orchestrator created from a validation finding on this task. */
  readonly fixOf?: string;
  /** Added by the Orchestrator from user feedback at a milestone gate. */
  readonly fromFeedback?: boolean;
};

export type Milestone = {
  readonly id: string;
  readonly title: string;
  readonly state: NodeState;
  readonly round: number;
  /** Validator session for the latest round; absent = not started. */
  readonly validatorKey?: string;
  readonly findings: readonly string[];
};

export type RunState = 'drafting' | 'running' | 'paused' | 'gated' | 'halted' | 'completed';

export type Orchestration = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly runState: RunState;
  readonly stopAtMilestones: boolean;
  readonly haltReason?: string;
  /** Milestone the run is paused after, waiting for the user's testing and feedback. */
  readonly gateMilestoneId?: string;
  readonly orchestratorKey: string;
  readonly milestones: readonly Milestone[];
  readonly tasks: readonly Task[];
  readonly sessions: readonly OSession[];
};

export type TrackerRef = { readonly provider: 'github' | 'gitlab' | 'jira' | 'linear'; readonly key: string };

export type WSession = {
  readonly key: string;
  readonly title: string;
  readonly cwd: string;
  readonly launchTarget: AgentLaunchTarget;
  readonly state: 'idle' | 'running' | 'waiting';
  readonly archived: boolean;
  readonly transcript: readonly StubLine[];
};

export type Workstream = {
  readonly id: string;
  readonly name: string;
  readonly trackers: readonly TrackerRef[];
  readonly archived: boolean;
  readonly sessions: readonly WSession[];
};

const HOME = '/Users/you';
const REPO = `${HOME}/Projects/agent-orchestrator`;
const DOCS = `${HOME}/Projects/hoa-docs`;
const SITE = `${HOME}/Projects/hoa-site`;
const SCRATCH = `${HOME}/.hoa/contextless/7f3a9c`;

const talk = (user: string, agent: string, ...rest: StubLine[]): StubLine[] => [
  { kind: 'user', text: user },
  { kind: 'agent', text: agent },
  ...rest,
];

const o = (
  session: Omit<OSession, 'queue' | 'transcript'> & { readonly transcript?: readonly StubLine[]; queue?: string[] },
): OSession => ({
  queue: [],
  transcript: talk(`Task: ${session.title}`, 'Stub transcript: fixture sessions never talk to an agent.', {
    kind: 'tool',
    text: 'Read GLOSSARY.md',
  }),
  ...session,
});

const w = (session: Omit<WSession, 'archived' | 'transcript'> & { readonly archived?: boolean }): WSession => ({
  archived: false,
  transcript: talk(session.title, 'Stub transcript: fixture sessions never talk to an agent.'),
  ...session,
});

/** Gated: M1 finished and the run stopped for the user to test it. */
const gated: Orchestration = {
  brief: 'Workstreams rail: user-named session groups across Projects (#185).',
  gateMilestoneId: 'g1',
  id: 'gated',
  milestones: [
    {
      findings: [],
      id: 'g1',
      round: 1,
      state: 'finished',
      title: 'Workstream ownership in hoa-home',
      validatorKey: 'g-v1',
    },
    { findings: [], id: 'g2', round: 0, state: 'not-started', title: 'Workstreams rail' },
    { findings: [], id: 'g3', round: 0, state: 'not-started', title: 'Archive a Workstream' },
  ],
  orchestratorKey: 'g-orch',
  runState: 'gated',
  sessions: [
    o({
      cwd: REPO,
      key: 'g-orch',
      launchTarget: 'claude-agent-acp',
      role: 'orchestrator',
      state: 'waiting',
      title: 'Orchestrator · Workstreams rail',
      transcript: talk(
        'Implement the Workstreams rail. Stop after each milestone so I can test.',
        'Plan: 3 milestones, 6 tasks. Validators run at the end of each milestone.',
        { kind: 'tool', text: 'start worker → codex-acp “owner union + workstreams.json”' },
        { kind: 'tool', text: 'start worker → claude-agent-acp “adopt / orphan operations”' },
        { kind: 'agent', text: 'M1 validated clean on round 1.' },
        {
          kind: 'gate',
          text: 'Milestone gate: M1 “Workstream ownership in hoa-home” is done. Test it, then tell me what to change before M2.',
        },
      ),
    }),
    o({
      cwd: REPO,
      key: 'g-w1',
      launchTarget: 'codex-acp',
      milestoneId: 'g1',
      role: 'worker',
      state: 'finished',
      title: 'Owner union + workstreams.json',
    }),
    o({
      cwd: REPO,
      key: 'g-w2',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'g1',
      role: 'worker',
      state: 'finished',
      title: 'Adopt / orphan operations',
    }),
    o({
      cwd: REPO,
      key: 'g-v1',
      launchTarget: 'codex-acp',
      milestoneId: 'g1',
      role: 'validator',
      state: 'finished',
      title: 'Validate M1 · round 1',
    }),
  ],
  stopAtMilestones: true,
  tasks: [
    { id: 'gt1', milestoneId: 'g1', sessionKey: 'g-w1', title: 'Owner union + workstreams.json' },
    { id: 'gt2', milestoneId: 'g1', sessionKey: 'g-w2', title: 'Adopt / orphan operations' },
    { id: 'gt3', milestoneId: 'g2', title: 'Rail: Workstreams with session rows' },
    { id: 'gt4', milestoneId: 'g2', title: 'Tracker links on a Workstream' },
    { id: 'gt5', milestoneId: 'g3', title: 'Archive cascades to sessions' },
    { id: 'gt6', milestoneId: 'g3', title: 'Docs: Workstreams in user guide' },
  ],
  title: 'Workstreams rail (#185)',
};

/** Running: one worker waiting on a permission, one running with a queued message, one paused by the user. */
const running: Orchestration = {
  brief: 'Orchestration Page with a view-only plan graph (#28).',
  id: 'running',
  milestones: [
    {
      findings: [],
      id: 'r1',
      round: 2,
      state: 'finished',
      title: 'Orchestration document + run state',
      validatorKey: 'r-v1',
    },
    {
      findings: ['Graph drops planned nodes after a plan revision.'],
      id: 'r2',
      round: 1,
      state: 'running',
      title: 'Plan graph',
    },
    { findings: [], id: 'r3', round: 0, state: 'not-started', title: 'Steering: interrupt, guide, queue' },
  ],
  orchestratorKey: 'r-orch',
  runState: 'running',
  sessions: [
    o({
      cwd: REPO,
      key: 'r-orch',
      launchTarget: 'claude-agent-acp',
      role: 'orchestrator',
      state: 'running',
      title: 'Orchestrator · Orchestration Page',
      transcript: talk(
        'Here is the plan doc. Run it; don’t stop at milestones.',
        'Loaded plan: 3 milestones, 7 tasks.',
        { kind: 'agent', text: 'M1 passed on round 2. Starting M2 with 3 workers.' },
        { kind: 'tool', text: 'start worker → cursor-acp “Lane layout from plan”' },
        { kind: 'tool', text: 'start worker → codex-acp “Node state from session status”' },
        { kind: 'tool', text: 'start worker → claude-agent-acp “Docs: reading the graph”' },
      ),
    }),
    o({
      cwd: REPO,
      key: 'r-w1',
      launchTarget: 'codex-acp',
      milestoneId: 'r1',
      role: 'worker',
      state: 'finished',
      title: 'orchestrations.json schema',
    }),
    o({
      cwd: REPO,
      key: 'r-w2',
      launchTarget: 'codex-acp',
      milestoneId: 'r1',
      role: 'worker',
      state: 'finished',
      title: 'Run state machine',
    }),
    o({
      cwd: REPO,
      key: 'r-v1',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'r1',
      role: 'validator',
      state: 'finished',
      title: 'Validate M1 · round 2',
    }),
    o({
      cwd: REPO,
      key: 'r-w3',
      launchTarget: 'cursor-acp',
      milestoneId: 'r2',
      queue: ['Keep ghost nodes for planned tasks.'],
      role: 'worker',
      state: 'running',
      title: 'Lane layout from plan',
    }),
    o({
      cwd: REPO,
      key: 'r-w4',
      launchTarget: 'codex-acp',
      milestoneId: 'r2',
      role: 'worker',
      state: 'waiting',
      title: 'Node state from session status',
      transcript: talk(
        'Task: Node state from session status',
        'Mapping session status to node state. Need to run the ui tests.',
        { kind: 'tool', text: 'Edit libs/ui/src/orchestration/nodeState.ts' },
        { kind: 'permission', text: 'Allow “pnpm --filter=@lib/ui test”?' },
      ),
    }),
    o({
      cwd: DOCS,
      key: 'r-w5',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'r2',
      role: 'worker',
      state: 'paused',
      title: 'Docs: reading the graph',
      transcript: talk('Task: Docs: reading the graph', 'Drafting the page with screenshots of every node state.', {
        kind: 'note',
        text: '⏹ You interrupted this session.',
      }),
    }),
  ],
  stopAtMilestones: false,
  tasks: [
    { id: 'rt1', milestoneId: 'r1', sessionKey: 'r-w1', title: 'orchestrations.json schema' },
    { id: 'rt2', milestoneId: 'r1', sessionKey: 'r-w2', title: 'Run state machine' },
    { id: 'rt3', milestoneId: 'r2', sessionKey: 'r-w3', title: 'Lane layout from plan' },
    { id: 'rt4', milestoneId: 'r2', sessionKey: 'r-w4', title: 'Node state from session status' },
    { id: 'rt5', milestoneId: 'r2', sessionKey: 'r-w5', title: 'Docs: reading the graph' },
    { id: 'rt6', milestoneId: 'r3', title: 'Interrupt maps to session/cancel' },
    { id: 'rt7', milestoneId: 'r3', title: 'Client-side message queue' },
  ],
  title: 'Orchestration Page (#28)',
};

const halted: Orchestration = {
  brief: 'Upgrade codex-acp to 0.6 and add a site changelog entry.',
  haltReason: 'Validation failed 3 rounds: 0.6 drops the session/list cursor. Pin 0.5.x or page client-side?',
  id: 'halted',
  milestones: [
    {
      findings: ['session/list returns no nextCursor; Project lists never complete.'],
      id: 'h1',
      round: 3,
      state: 'failed',
      title: 'Adapter bump',
      validatorKey: 'h-v1',
    },
    { findings: [], id: 'h2', round: 0, state: 'not-started', title: 'Changelog' },
  ],
  orchestratorKey: 'h-orch',
  runState: 'halted',
  sessions: [
    o({
      cwd: REPO,
      key: 'h-orch',
      launchTarget: 'codex-acp',
      role: 'orchestrator',
      state: 'waiting',
      title: 'Orchestrator · codex-acp 0.6',
      transcript: talk('Bump codex-acp to 0.6; add a changelog entry.', 'Adapter bump failed validation 3 rounds.', {
        kind: 'halt',
        text: 'Halted: 0.6 drops the session/list cursor. Pin 0.5.x or page client-side?',
      }),
    }),
    o({
      cwd: REPO,
      key: 'h-w1',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'h1',
      role: 'worker',
      state: 'failed',
      title: 'Bump catalog + provider pin',
    }),
    o({
      cwd: REPO,
      key: 'h-w2',
      launchTarget: 'codex-acp',
      milestoneId: 'h1',
      role: 'worker',
      state: 'failed',
      title: 'Fix: page session/list client-side',
    }),
    o({
      cwd: REPO,
      key: 'h-v1',
      launchTarget: 'codex-acp',
      milestoneId: 'h1',
      role: 'validator',
      state: 'failed',
      title: 'Validate adapter bump · round 3',
    }),
  ],
  stopAtMilestones: false,
  tasks: [
    { id: 'ht1', milestoneId: 'h1', sessionKey: 'h-w1', title: 'Bump catalog + provider pin' },
    { fixOf: 'ht1', id: 'ht2', milestoneId: 'h1', sessionKey: 'h-w2', title: 'Fix: page session/list client-side' },
    { id: 'ht3', milestoneId: 'h2', title: 'Site changelog entry' },
  ],
  title: 'codex-acp 0.6',
};

const drafting: Orchestration = {
  brief: 'Link Linear issues to Workstreams.',
  id: 'drafting',
  milestones: [
    { findings: [], id: 'd1', round: 0, state: 'not-started', title: 'Tracker ref union' },
    { findings: [], id: 'd2', round: 0, state: 'not-started', title: 'Linear link picker' },
  ],
  orchestratorKey: 'd-orch',
  runState: 'drafting',
  sessions: [
    o({
      cwd: SITE,
      key: 'd-orch',
      launchTarget: 'claude-agent-acp',
      role: 'orchestrator',
      state: 'waiting',
      title: 'Orchestrator · Linear links',
      transcript: talk(
        'Let’s plan Linear links for Workstreams.',
        'Draft plan: 2 milestones. Should the picker search Linear, or take a pasted URL only?',
      ),
    }),
  ],
  stopAtMilestones: true,
  tasks: [
    { id: 'dt1', milestoneId: 'd1', title: 'Provider + key union' },
    { id: 'dt2', milestoneId: 'd2', title: 'Paste-a-URL picker' },
  ],
  title: 'Linear links (draft)',
};

const completed: Orchestration = {
  brief: 'Contextless session directories (#400).',
  id: 'completed',
  milestones: [
    { findings: [], id: 'c1', round: 1, state: 'finished', title: 'Contextless dirs', validatorKey: 'c-v1' },
  ],
  orchestratorKey: 'c-orch',
  runState: 'completed',
  sessions: [
    o({
      cwd: SCRATCH,
      key: 'c-orch',
      launchTarget: 'codex-acp',
      role: 'orchestrator',
      state: 'finished',
      title: 'Orchestrator · Contextless dirs',
    }),
    o({
      cwd: REPO,
      key: 'c-w1',
      launchTarget: 'codex-acp',
      milestoneId: 'c1',
      role: 'worker',
      state: 'finished',
      title: 'Create ~/.hoa/contextless/<id>',
    }),
    o({
      cwd: REPO,
      key: 'c-v1',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'c1',
      role: 'validator',
      state: 'finished',
      title: 'Validate · round 1',
    }),
  ],
  stopAtMilestones: false,
  tasks: [{ id: 'ct1', milestoneId: 'c1', sessionKey: 'c-w1', title: 'Create ~/.hoa/contextless/<id>' }],
  title: 'Contextless dirs (#400)',
};

export const ORCHESTRATIONS: readonly Orchestration[] = [running, gated, halted, drafting, completed];

export const WORKSTREAMS: readonly Workstream[] = [
  {
    archived: false,
    id: 'projects',
    name: 'Projects model',
    sessions: [
      w({
        cwd: REPO,
        key: 'p-1',
        launchTarget: 'claude-agent-acp',
        state: 'idle',
        title: 'Grill: Projects replace all-cwd session/list',
      }),
      w({
        cwd: REPO,
        key: 'p-2',
        launchTarget: 'codex-acp',
        state: 'running',
        title: 'Implement projects.json in hoa-home',
      }),
      w({
        cwd: DOCS,
        key: 'p-3',
        launchTarget: 'claude-agent-acp',
        state: 'idle',
        title: 'Document Projects in the user guide',
      }),
      w({
        archived: true,
        cwd: SCRATCH,
        key: 'p-4',
        launchTarget: 'codex-acp',
        state: 'idle',
        title: 'Scratch: does session/list page past 500 rows?',
      }),
    ],
    trackers: [
      { key: 'Harris-Miller/agent-orchestrator#386', provider: 'github' },
      { key: 'HOA-42', provider: 'linear' },
    ],
  },
  {
    archived: false,
    id: 'theming',
    name: 'Catppuccin themes',
    sessions: [
      w({
        cwd: SCRATCH,
        key: 't-1',
        launchTarget: 'claude-agent-acp',
        state: 'idle',
        title: 'Research: Catppuccin palette mapping',
      }),
      w({
        cwd: REPO,
        key: 't-2',
        launchTarget: 'cursor-acp',
        state: 'waiting',
        title: 'Add fromCatppuccin theme builder',
      }),
    ],
    trackers: [{ key: 'Harris-Miller/agent-orchestrator#310', provider: 'github' }],
  },
  {
    archived: true,
    id: 'oauth',
    name: 'MCP OAuth',
    sessions: [
      w({
        archived: true,
        cwd: REPO,
        key: 'a-1',
        launchTarget: 'codex-acp',
        state: 'idle',
        title: 'MCP OAuth callback server',
      }),
    ],
    trackers: [{ key: 'PLAT-118', provider: 'jira' }],
  },
];

/** Fixture stand-ins for Sessions Page sessions (the real Sessions Page is your History, which we never touch). */
export const SESSIONS_PAGE_POOL: readonly WSession[] = [
  w({
    cwd: REPO,
    key: 's-1',
    launchTarget: 'claude-agent-acp',
    state: 'idle',
    title: 'Why is the Composer quote bar clipped?',
  }),
  w({ cwd: SITE, key: 's-2', launchTarget: 'codex-acp', state: 'idle', title: 'Landing page copy pass' }),
  w({ cwd: SCRATCH, key: 's-3', launchTarget: 'claude-agent-acp', state: 'idle', title: 'Research: Linear API auth' }),
];
