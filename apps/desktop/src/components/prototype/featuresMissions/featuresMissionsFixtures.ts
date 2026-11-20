/**
 * PROTOTYPE (#185 Features + #28 Missions, assuming #409 app-tracked sessions). Throwaway: lives on
 * `prototype/185-28-features-missions`, never main.
 *
 * One model, shared by every variant (variants disagree on layout, not on this):
 * - Feature: a user-named set of session refs (`launchTarget` + `sessionId`). Not derived from cwd, so it spans
 *   Projects and contextless dirs (`~/.hoa/contextless/<id>`, #400). Possible because of #409: the app knows which
 *   sessions it created, so membership is recorded at create time.
 * - Mission: an optional automation on a Feature. An orchestrator session plans milestones → tasks, spawns a worker
 *   session per task and validator sessions per milestone round; every session it creates joins the Feature.
 *   "Task" (not Factory's "feature", which collides with #185, and not "Work item", a desktop glossary term).
 */
import type { AgentLaunchTarget, UnifiedHistoryEntry } from '@lib/ui';

export type SessionRole = 'manual' | 'orchestrator' | 'worker' | 'validator';
export type SessionState = 'idle' | 'running' | 'needs-you' | 'done' | 'failed';
export type LinkKind = 'handoff' | 'spawn' | 'fix';

export type ProtoSession = {
  readonly key: string;
  readonly launchTarget: AgentLaunchTarget;
  readonly title: string;
  readonly cwd: string;
  readonly role: SessionRole;
  readonly state: SessionState;
  /** Minutes ago the session started; orders lanes and timelines. */
  readonly startedAgo: number;
  readonly from?: { readonly key: string; readonly via: LinkKind };
  readonly taskId?: string;
  readonly milestoneId?: string;
  /** Backed by a real History entry: clicking it activates the real session. */
  readonly real?: UnifiedHistoryEntry;
  readonly transcript: readonly StubLine[];
};

export type StubLine =
  | { readonly kind: 'user' | 'agent'; readonly text: string }
  | { readonly kind: 'tool'; readonly text: string }
  | { readonly kind: 'permission'; readonly text: string }
  | { readonly kind: 'halt'; readonly text: string };

export type TaskState = 'planned' | 'running' | 'needs-you' | 'validating' | 'passed' | 'failed';
export type Task = {
  readonly id: string;
  readonly milestoneId: string;
  readonly title: string;
  readonly state: TaskState;
  readonly sessionKey?: string;
  /** A fix task the orchestrator created from a validation finding. */
  readonly fixOf?: string;
};

export type Severity = 'blocking' | 'non-blocking' | 'suggestion';
export type MilestoneState = 'planned' | 'running' | 'validating' | 'passed' | 'failed';
export type Milestone = {
  readonly id: string;
  readonly title: string;
  readonly state: MilestoneState;
  readonly round: number;
  readonly findings: readonly { readonly severity: Severity; readonly text: string }[];
};

export type MissionState = 'running' | 'halted' | 'done';
export type Mission = {
  readonly brief: string;
  readonly state: MissionState;
  readonly haltReason?: string;
  readonly orchestratorKey: string;
  readonly milestones: readonly Milestone[];
  readonly tasks: readonly Task[];
};

export type Feature = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sessions: readonly ProtoSession[];
  readonly mission?: Mission;
};

const HOME = '/Users/you';
const REPO = `${HOME}/Projects/agent-orchestrator`;
const DOCS = `${HOME}/Projects/hoa-docs`;
const SITE = `${HOME}/Projects/hoa-site`;
const CONTEXTLESS = `${HOME}/.hoa/contextless/7f3a9c`;

const chat = (user: string, agent: string, ...rest: StubLine[]): StubLine[] => [
  { kind: 'user', text: user },
  { kind: 'agent', text: agent },
  ...rest,
];

const s = (
  session: Omit<ProtoSession, 'transcript'> & { readonly transcript?: readonly StubLine[] },
): ProtoSession => ({
  transcript: chat(`(prototype) ${session.title}`, 'Stub transcript — fixture sessions never talk to an agent.', {
    kind: 'tool',
    text: 'Read GLOSSARY.md',
  }),
  ...session,
});

/** Manual Feature: Handoff chain across launch targets and cwds, plus a contextless scratch session. */
const manualFeature = (real: readonly UnifiedHistoryEntry[]): Feature => {
  const [first, second] = real;
  const fromReal = (entry: UnifiedHistoryEntry | undefined, fallback: ProtoSession): ProtoSession =>
    entry === undefined
      ? fallback
      : {
          ...fallback,
          cwd: entry.cwd,
          launchTarget: entry.launchTarget,
          real: entry,
          title: entry.title ?? 'New Session',
        };
  const grill = fromReal(
    first,
    s({
      cwd: REPO,
      key: 'pm-grill',
      launchTarget: 'claude-agent-acp',
      role: 'manual',
      startedAgo: 2880,
      state: 'done',
      title: 'Grill: Projects replace all-cwd session/list',
    }),
  );
  const impl = fromReal(
    second,
    s({
      cwd: REPO,
      from: { key: grill.key, via: 'handoff' },
      key: 'pm-impl',
      launchTarget: 'codex-acp',
      role: 'manual',
      startedAgo: 1440,
      state: 'idle',
      title: 'Implement projects.json in hoa-home',
    }),
  );
  return {
    description: 'Hand-run sessions for #386, handed off between agents and repos.',
    id: 'projects-model',
    name: 'Projects model (#386)',
    sessions: [
      grill,
      impl,
      s({
        cwd: DOCS,
        from: { key: impl.key, via: 'handoff' },
        key: 'pm-docs',
        launchTarget: 'claude-agent-acp',
        role: 'manual',
        startedAgo: 600,
        state: 'running',
        title: 'Document Projects in the user guide',
      }),
      s({
        cwd: CONTEXTLESS,
        key: 'pm-spike',
        launchTarget: 'codex-acp',
        role: 'manual',
        startedAgo: 300,
        state: 'idle',
        title: 'Scratch: does session/list page past 500 rows?',
      }),
    ],
  };
};

const featureGroupsMission: Feature = {
  description: 'Mission: add Features (user-named session groups across Projects).',
  id: 'features-mission',
  mission: {
    brief: 'Add a Features section: user-named groups of sessions that span Projects.',
    milestones: [
      { findings: [], id: 'm1', round: 2, state: 'passed', title: 'Feature membership in hoa-home' },
      {
        findings: [
          { severity: 'blocking', text: 'Features rail drops the Selected session after Stop tracking.' },
          { severity: 'non-blocking', text: 'Empty Feature shows no "+" to start a session.' },
          { severity: 'suggestion', text: 'Caption cwd basename on cross-Project rows.' },
        ],
        id: 'm2',
        round: 2,
        state: 'validating',
        title: 'Features rail',
      },
      { findings: [], id: 'm3', round: 0, state: 'planned', title: 'Mission Control view' },
    ],
    orchestratorKey: 'fm-orch',
    state: 'running',
    tasks: [
      { id: 't1', milestoneId: 'm1', sessionKey: 'fm-w1', state: 'passed', title: 'features.json schema + read/write' },
      { id: 't2', milestoneId: 'm1', sessionKey: 'fm-w2', state: 'passed', title: 'Record membership at Materialize' },
      { id: 't3', milestoneId: 'm2', sessionKey: 'fm-w3', state: 'validating', title: 'Sessions | Features rail tab' },
      { id: 't4', milestoneId: 'm2', sessionKey: 'fm-w4', state: 'validating', title: 'Docs: Features in user guide' },
      {
        fixOf: 't3',
        id: 't5',
        milestoneId: 'm2',
        sessionKey: 'fm-w5',
        state: 'needs-you',
        title: 'Fix: keep Selected after Stop tracking',
      },
      { id: 't6', milestoneId: 'm3', state: 'planned', title: 'Milestone board' },
      { id: 't7', milestoneId: 'm3', state: 'planned', title: 'Needs-you inbox' },
    ],
  },
  name: 'Features section (#185)',
  sessions: [
    s({
      cwd: REPO,
      key: 'fm-orch',
      launchTarget: 'claude-agent-acp',
      role: 'orchestrator',
      startedAgo: 900,
      state: 'running',
      title: 'Orchestrator · Features section',
      transcript: chat(
        'Build #185. Plan milestones, validate each one.',
        'Plan approved: 3 milestones, 7 tasks. Validators run at the end of each milestone.',
        { kind: 'tool', text: 'spawn_subagent → codex-acp “features.json schema + read/write”' },
        { kind: 'tool', text: 'spawn_subagent → claude-agent-acp “Record membership at Materialize”' },
        { kind: 'agent', text: 'M1 passed on round 2. Starting M2.' },
        { kind: 'tool', text: 'Validator round 2 on M2: 1 blocking, 1 non-blocking, 1 suggestion' },
        { kind: 'agent', text: 'Created fix task “Keep Selected after Stop tracking”.' },
      ),
    }),
    s({
      cwd: REPO,
      from: { key: 'fm-orch', via: 'spawn' },
      key: 'fm-w1',
      launchTarget: 'codex-acp',
      milestoneId: 'm1',
      role: 'worker',
      startedAgo: 880,
      state: 'done',
      taskId: 't1',
      title: 'features.json schema + read/write',
    }),
    s({
      cwd: REPO,
      from: { key: 'fm-orch', via: 'spawn' },
      key: 'fm-w2',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'm1',
      role: 'worker',
      startedAgo: 860,
      state: 'done',
      taskId: 't2',
      title: 'Record membership at Materialize',
    }),
    s({
      cwd: REPO,
      from: { key: 'fm-orch', via: 'spawn' },
      key: 'fm-v1',
      launchTarget: 'codex-acp',
      milestoneId: 'm1',
      role: 'validator',
      startedAgo: 700,
      state: 'done',
      title: 'Validate M1 · round 2',
    }),
    s({
      cwd: REPO,
      from: { key: 'fm-orch', via: 'spawn' },
      key: 'fm-w3',
      launchTarget: 'cursor-acp',
      milestoneId: 'm2',
      role: 'worker',
      startedAgo: 500,
      state: 'done',
      taskId: 't3',
      title: 'Sessions | Features rail tab',
    }),
    s({
      cwd: DOCS,
      from: { key: 'fm-orch', via: 'spawn' },
      key: 'fm-w4',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'm2',
      role: 'worker',
      startedAgo: 480,
      state: 'done',
      taskId: 't4',
      title: 'Docs: Features in user guide',
    }),
    s({
      cwd: REPO,
      from: { key: 'fm-orch', via: 'spawn' },
      key: 'fm-v2',
      launchTarget: 'codex-acp',
      milestoneId: 'm2',
      role: 'validator',
      startedAgo: 120,
      state: 'done',
      title: 'Validate M2 · round 2',
    }),
    s({
      cwd: REPO,
      from: { key: 'fm-v2', via: 'fix' },
      key: 'fm-w5',
      launchTarget: 'codex-acp',
      milestoneId: 'm2',
      role: 'worker',
      startedAgo: 40,
      state: 'needs-you',
      taskId: 't5',
      title: 'Fix: keep Selected after Stop tracking',
      transcript: chat(
        'Fix: Features rail drops the Selected session after Stop tracking.',
        'Reproduced in ProjectGroup test. Patching selection fallback.',
        { kind: 'tool', text: 'Edit libs/ui/src/atoms/selected.atoms.ts' },
        { kind: 'permission', text: 'Allow “pnpm --filter=@lib/ui test”?' },
      ),
    }),
  ],
};

const codexBumpMission: Feature = {
  description: 'Mission: bump codex-acp to 0.6 across the app and the marketing site.',
  id: 'codex-bump',
  mission: {
    brief: 'Upgrade codex-acp to 0.6 and update the site changelog.',
    haltReason: 'Validation failed 3 rounds: 0.6 drops the session/list cursor. Pin 0.5.x or page client-side?',
    milestones: [
      {
        findings: [{ severity: 'blocking', text: 'session/list returns no nextCursor; Project lists never complete.' }],
        id: 'b1',
        round: 3,
        state: 'failed',
        title: 'Adapter bump',
      },
      { findings: [], id: 'b2', round: 0, state: 'planned', title: 'Changelog' },
    ],
    orchestratorKey: 'cb-orch',
    state: 'halted',
    tasks: [
      { id: 'u1', milestoneId: 'b1', sessionKey: 'cb-w1', state: 'failed', title: 'Bump catalog + provider pin' },
      { id: 'u2', milestoneId: 'b2', state: 'planned', title: 'Site changelog entry' },
    ],
  },
  name: 'codex-acp 0.6',
  sessions: [
    s({
      cwd: REPO,
      key: 'cb-orch',
      launchTarget: 'codex-acp',
      role: 'orchestrator',
      startedAgo: 200,
      state: 'needs-you',
      title: 'Orchestrator · codex-acp 0.6',
      transcript: chat(
        'Bump codex-acp to 0.6; add a changelog entry on the site.',
        'Adapter bump failed validation 3 rounds in a row.',
        {
          kind: 'halt',
          text: 'Mission halted: 0.6 drops the session/list cursor. Pin 0.5.x or page client-side? Control is yours.',
        },
      ),
    }),
    s({
      cwd: REPO,
      from: { key: 'cb-orch', via: 'spawn' },
      key: 'cb-w1',
      launchTarget: 'claude-agent-acp',
      milestoneId: 'b1',
      role: 'worker',
      startedAgo: 190,
      state: 'failed',
      taskId: 'u1',
      title: 'Bump catalog + provider pin',
    }),
    s({
      cwd: REPO,
      from: { key: 'cb-orch', via: 'spawn' },
      key: 'cb-v1',
      launchTarget: 'codex-acp',
      milestoneId: 'b1',
      role: 'validator',
      startedAgo: 60,
      state: 'failed',
      title: 'Validate adapter bump · round 3',
    }),
    s({
      cwd: SITE,
      key: 'cb-site',
      launchTarget: 'claude-agent-acp',
      role: 'manual',
      startedAgo: 30,
      state: 'idle',
      title: 'Draft changelog copy (added by hand)',
    }),
  ],
};

/** Two real History entries (distinct cwds when possible) seed the manual Feature; the rest stay ungrouped. */
export const buildFeatures = (
  realEntries: readonly UnifiedHistoryEntry[],
): { readonly features: readonly Feature[]; readonly ungrouped: readonly UnifiedHistoryEntry[] } => {
  const [first] = realEntries;
  const second = realEntries.find(entry => entry !== first && entry.cwd !== first?.cwd) ?? realEntries[1];
  const seeded = [first, second].filter(entry => entry !== undefined);
  return {
    features: [manualFeature(seeded), featureGroupsMission, codexBumpMission],
    ungrouped: realEntries.filter(entry => !seeded.includes(entry)),
  };
};

export const sessionByKey = (feature: Feature, key: string | undefined): ProtoSession | undefined =>
  feature.sessions.find(session => session.key === key);

export const needsYou = (feature: Feature): readonly ProtoSession[] =>
  feature.sessions.filter(session => session.state === 'needs-you');
