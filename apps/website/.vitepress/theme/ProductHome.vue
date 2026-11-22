<script setup lang="ts">
/**
 * The landing page: a long-scroll marketing landing that leads with
 * a live-looking mock of the app, then explains the model in steps, then sends you to the docs.
 */
import { withBase } from 'vitepress';
import { REPO_URL } from '../../shared/site.ts';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const REPO = REPO_URL;

// The mock "plays" a turn: work items appear, then a permission request waits on the user.
const step = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    step.value = (step.value + 1) % 7;
  }, 1400);
});
onBeforeUnmount(() => clearInterval(timer));

const workItems = ['Read apps/desktop/src/main.tsx', 'Searched “SessionHistory”', 'Edited libs/ui/src/SessionRow.tsx'];

const steps = [
  {
    title: 'You pick the agent',
    body: 'Codex, Claude, Cursor or Antigravity. HOA downloads it for you and runs it on your machine.',
  },
  {
    title: 'HOA speaks ACP to it',
    body: 'The Agent Harness is an Agent Client Protocol client: it sends your prompts over stdio and streams the agent’s work back.',
  },
  {
    title: 'The agent asks, you answer',
    body: 'Files, terminals and permission go through HOA. Requests wait on the session — and notify you — until you decide.',
  },
];

const rows = [
  {
    eyebrow: 'Mid-turn send',
    title: 'Steer the agent without stopping it',
    body: 'Spotted the agent heading the wrong way? Send a message into the turn that is running — it joins the same turn. Or queue one to go out the moment the turn ends.',
    link: '/guide/working-with-agents#sending-while-the-agent-is-working',
    demo: 'steer',
  },
  {
    eyebrow: 'Handoff',
    title: 'Move the work to another agent',
    body: 'Ask Claude to write a handoff document and continue on Codex, in the same directory, with the model and mode you pick. No copy-paste, no lost context.',
    link: '/guide/handoff-and-subagents#handoff',
    demo: 'handoff',
  },
  {
    eyebrow: 'One history',
    title: 'Every agent’s sessions, grouped by Project',
    body: 'Sessions you start in HOA and sessions you import from an agent’s own store, side by side. Pin what matters, archive what’s done, bulk-select the rest.',
    link: '/guide/sessions',
    demo: 'history',
  },
] as const;

const providers = [
  { name: 'Codex', via: 'codex-acp adapter', beta: false },
  { name: 'Claude', via: 'claude-agent-acp adapter', beta: false },
  { name: 'Cursor', via: 'cursor-agent acp', beta: true },
  { name: 'Antigravity', via: 'managed ACP binary', beta: true },
];
</script>

<template>
  <div class="ph">
    <!-- HERO -->
    <section class="hero">
      <p class="pill">Pre-alpha · built on the Agent Client Protocol</p>
      <h1>Every coding agent.<br /><span>One harness.</span></h1>
      <p class="lede">
        HOA runs Codex, Claude and more side by side in one desktop app — one Session History, one composer, and one
        place to answer every permission prompt.
      </p>
      <div class="ctas">
        <a class="btn primary" :href="withBase('/guide/getting-started')">Build it from source</a>
        <a class="btn" :href="REPO" target="_blank" rel="noreferrer">View on GitHub</a>
      </div>

      <div class="app" aria-label="Illustration of the HOA app">
        <div class="titlebar"><i /><i /><i /><span>HOA</span></div>
        <div class="app-body">
          <aside class="history">
            <div class="h-head">Session History</div>
            <div class="h-group">📌 Pinned</div>
            <div class="h-row"><b>Release checklist</b><small>Claude</small></div>
            <div class="h-group">agent-orchestrator</div>
            <div class="h-row active"><b>Session rows show agent</b><small>Claude · running</small></div>
            <div class="h-row"><b>Fix RPC wire filtering</b><small>Codex</small></div>
            <div class="h-row"><b>Workstreams page</b><small>Cursor</small></div>
            <div class="h-group">website</div>
            <div class="h-row"><b>VitePress variants</b><small>Codex</small></div>
          </aside>
          <main class="chat">
            <div class="msg user">Show which agent each Session History row runs on.</div>
            <div class="work">
              <div class="work-head">▾ Working… <small>{{ Math.min(step, 3) }} steps</small></div>
              <div v-for="(w, i) in workItems" v-show="step > i" :key="w" class="work-item">✓ {{ w }}</div>
            </div>
            <div v-show="step >= 4" class="permission">
              <div><b>Run command?</b> <code>pnpm --filter=@lib/ui test</code></div>
              <div class="perm-actions">
                <span class="allow">Allow once</span><span>Always allow</span><span>Reject</span>
              </div>
            </div>
            <div class="composer">
              <span class="draft">{{ step >= 5 ? 'Also add it to the tooltip' : 'Message Claude…' }}</span>
              <span class="send">{{ step >= 5 ? 'Steer ↵' : 'Send' }}</span>
            </div>
          </main>
        </div>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section class="how">
      <h2>How it works</h2>
      <ol>
        <li v-for="(s, i) in steps" :key="s.title">
          <span class="num">{{ i + 1 }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.body }}</p>
        </li>
      </ol>
      <p class="aside">
        No vendor SDK is embedded. If it speaks ACP, it’s a launch target away.
        <a :href="withBase('/guide/what-is-hoa')">What is HOA? →</a>
      </p>
    </section>

    <!-- FEATURE ROWS -->
    <section v-for="(r, i) in rows" :key="r.title" class="row" :class="{ flip: i % 2 === 1 }">
      <div class="row-copy">
        <p class="eyebrow">{{ r.eyebrow }}</p>
        <h2>{{ r.title }}</h2>
        <p>{{ r.body }}</p>
        <a :href="withBase(r.link)">Read the guide →</a>
      </div>
      <div class="row-demo" aria-hidden="true">
        <template v-if="r.demo === 'steer'">
          <div class="bubble user">Run the tests first</div>
          <div class="bubble agent">Running <code>pnpm test</code>…</div>
          <div class="bubble user steer"><em>Steering</em> Only the ui package, please</div>
          <div class="bubble agent">Narrowing to <code>@lib/ui</code>.</div>
        </template>
        <template v-else-if="r.demo === 'handoff'">
          <div class="handoff">
            <div class="card">Claude<small>writes handoff.md</small></div>
            <div class="arrow">→</div>
            <div class="card">Codex<small>continues · same cwd</small></div>
          </div>
        </template>
        <template v-else>
          <div class="mini-history">
            <div class="g">agent-orchestrator</div>
            <div>Fix RPC wire filtering <small>Codex</small></div>
            <div>Session rows show agent <small>Claude</small></div>
            <div class="g">website</div>
            <div>VitePress variants <small>Codex</small></div>
            <div class="archived">Old spike <small>archived</small></div>
          </div>
        </template>
      </div>
    </section>

    <!-- PROVIDERS -->
    <section class="providers">
      <h2>Bring the agents you already use</h2>
      <div class="grid">
        <div v-for="p in providers" :key="p.name" class="prov">
          <b>{{ p.name }}</b>
          <small>{{ p.via }}</small>
          <span v-if="p.beta" class="beta">beta</span>
        </div>
      </div>
      <p class="aside">
        Also in VS Code: the same UI in the Secondary Side Bar, sharing your runtimes and Projects.
        <a :href="withBase('/guide/vscode')">VS Code extension →</a>
      </p>
    </section>

    <!-- CTA -->
    <section class="cta">
      <h2>Try it today</h2>
      <p>No installers yet. You need Node ≥ 22, pnpm and the Tauri prerequisites.</p>
      <pre><code>git clone {{ REPO }}.git
cd agent-orchestrator
pnpm install
pnpm run tauri:dev</code></pre>
      <a class="btn primary" :href="withBase('/guide/getting-started')">Full getting-started guide</a>
    </section>
  </div>
</template>

<style scoped>
.ph {
  --ink: #f3f7ff;
  --muted: #a0a7b5;
  --paper: #1d2027;
  --deep: #13171b;
  --line: rgb(255 255 255 / 0.09);
  --teal: #1fc8b8;
  --violet: #c792ea;
  --blue: #60a7ff;
  color: var(--ink);
  background:
    radial-gradient(1200px 600px at 50% -10%, rgb(31 200 184 / 0.18), transparent 60%),
    radial-gradient(800px 500px at 100% 30%, rgb(199 146 234 / 0.1), transparent 60%), #0b0d10;
  overflow: hidden;
}
section {
  max-width: 1120px;
  margin: 0 auto;
  padding: 96px 24px;
}
h1,
h2,
h3 {
  border: 0;
  margin: 0;
  padding: 0;
  letter-spacing: -0.02em;
  color: var(--ink);
}
a {
  color: var(--teal);
  text-decoration: none;
  font-weight: 600;
}
.hero {
  text-align: center;
  padding-top: 72px;
}
.pill {
  display: inline-block;
  padding: 4px 14px;
  border: 1px solid rgb(31 200 184 / 0.4);
  border-radius: 999px;
  color: var(--teal);
  font-size: 13px;
}
.hero h1 {
  margin-top: 20px;
  font-size: clamp(40px, 7vw, 76px);
  line-height: 1.02;
  font-weight: 800;
}
.hero h1 span {
  background: linear-gradient(90deg, var(--teal), var(--violet));
  background-clip: text;
  color: transparent;
}
.lede {
  max-width: 640px;
  margin: 24px auto 0;
  font-size: 19px;
  line-height: 1.6;
  color: var(--muted);
}
.ctas {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 32px;
}
.btn {
  display: inline-block;
  padding: 12px 22px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgb(255 255 255 / 0.04);
  color: var(--ink);
}
.btn.primary {
  background: var(--teal);
  border-color: var(--teal);
  color: #062521;
}

/* App mock */
.app {
  margin: 64px auto 0;
  max-width: 980px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--deep);
  box-shadow:
    0 40px 120px rgb(0 0 0 / 0.6),
    0 0 0 1px rgb(31 200 184 / 0.12);
  text-align: left;
  font-size: 13px;
  overflow: hidden;
}
.titlebar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}
.titlebar i {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #3a3f4a;
}
.titlebar span {
  margin-left: 8px;
}
.app-body {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 380px;
}
.history {
  border-right: 1px solid var(--line);
  padding: 10px 8px;
}
.h-head {
  font-weight: 700;
  padding: 4px 8px 10px;
}
.h-group {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 8px 4px;
}
.h-row {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  border-radius: 6px;
}
.h-row b {
  font-weight: 500;
}
.h-row small {
  color: var(--muted);
}
.h-row.active {
  background: rgb(96 167 255 / 0.14);
}
.chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
}
.msg.user {
  align-self: flex-end;
  max-width: 70%;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgb(199 146 234 / 0.32);
}
.work {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 12px;
  background: var(--paper);
}
.work-head small {
  color: var(--muted);
  margin-left: 6px;
}
.work-item {
  color: var(--muted);
  padding-top: 6px;
  animation: in 0.3s ease;
}
.permission {
  border: 1px solid rgb(225 84 40 / 0.5);
  background: #3e2724;
  border-radius: 10px;
  padding: 12px;
  animation: in 0.3s ease;
}
.perm-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.perm-actions span {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--line);
}
.perm-actions .allow {
  background: var(--blue);
  color: #06162b;
  border-color: var(--blue);
}
.composer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--paper);
  border: 1px solid var(--line);
}
.draft {
  color: var(--muted);
}
.send {
  padding: 4px 10px;
  border-radius: 6px;
  background: #1061ad;
}
@keyframes in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

/* How it works */
.how h2,
.providers h2,
.cta h2 {
  font-size: clamp(28px, 4vw, 40px);
  text-align: center;
}
.how ol {
  list-style: none;
  padding: 0;
  margin: 48px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
  counter-reset: none;
}
.how li {
  margin: 0;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgb(255 255 255 / 0.02);
}
.num {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgb(31 200 184 / 0.15);
  color: var(--teal);
  font-weight: 700;
}
.how h3 {
  margin-top: 14px;
  font-size: 20px;
}
.how p,
.row-copy p,
.cta p {
  color: var(--muted);
  line-height: 1.65;
}
.aside {
  margin-top: 32px;
  text-align: center;
  color: var(--muted);
}

/* Feature rows */
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: center;
  padding-top: 48px;
  padding-bottom: 48px;
}
.row.flip .row-copy {
  order: 2;
}
.eyebrow {
  color: var(--violet);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  margin: 0 0 8px;
}
.row-copy h2 {
  font-size: 32px;
  line-height: 1.15;
}
.row-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 240px;
  justify-content: center;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--deep);
  font-size: 14px;
}
.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--paper);
}
.bubble.user {
  align-self: flex-end;
  background: rgb(199 146 234 / 0.32);
}
.bubble.steer em {
  display: block;
  font-size: 11px;
  font-style: normal;
  color: var(--teal);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.handoff {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 26px;
  border-radius: 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  font-weight: 700;
  font-size: 18px;
}
.card small {
  font-weight: 400;
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
}
.arrow {
  font-size: 28px;
  color: var(--teal);
}
.mini-history div {
  display: flex;
  justify-content: space-between;
  padding: 6px 4px;
}
.mini-history small {
  color: var(--muted);
}
.mini-history .g {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-top: 12px;
}
.mini-history .archived {
  opacity: 0.5;
}

/* Providers */
.providers .grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 40px;
}
.prov {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 22px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgb(255 255 255 / 0.02);
}
.prov b {
  font-size: 20px;
}
.prov small {
  color: var(--muted);
  font-family: var(--vp-font-family-mono);
}
.beta {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(199 146 234 / 0.2);
  color: var(--violet);
}

/* CTA */
.cta {
  text-align: center;
  padding-bottom: 140px;
}
.cta pre {
  display: inline-block;
  text-align: left;
  margin: 16px 0 28px;
  padding: 18px 24px;
  border-radius: 12px;
  background: var(--deep);
  border: 1px solid var(--line);
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 760px) {
  section {
    padding: 64px 16px;
  }
  .app-body {
    grid-template-columns: 1fr;
  }
  .history {
    display: none;
  }
  .row {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .row.flip .row-copy {
    order: 0;
  }
}
</style>
