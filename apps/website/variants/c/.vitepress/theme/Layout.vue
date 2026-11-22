<script setup lang="ts">
/**
 * PROTOTYPE (#435) variant C — "Terminal manual". Every page is a man page: a fixed header line,
 * an index tree on the left, the page, and its SECTIONS on the right. `/` or ⌘K opens a command
 * palette over every page and the current page's sections. Home is a terminal session.
 */
import { onContentUpdated, useData, withBase, type DefaultTheme } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import PrototypeSwitcher from '../../../../shared/PrototypeSwitcher.vue';
import CommandPalette from './CommandPalette.vue';

const { page, frontmatter, theme, isDark } = useData<DefaultTheme.Config>();

const groups = computed(() => (theme.value.sidebar ?? []) as DefaultTheme.SidebarItem[]);
const pages = computed(() =>
  groups.value.flatMap(g =>
    (g.items ?? []).map(i => ({ text: i.text ?? '', link: i.link ?? '/', group: g.text ?? '' })),
  ),
);
const currentLink = computed(
  () => `/${page.value.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`,
);
const currentIndex = computed(() => pages.value.findIndex(p => p.link === currentLink.value));
const prev = computed(() => pages.value[currentIndex.value - 1]);
const next = computed(() => pages.value[currentIndex.value + 1]);
const current = computed(() => pages.value[currentIndex.value]);
const isHome = computed(() => frontmatter.value.layout === 'home');
const manName = computed(() => (current.value ? current.value.link.split('/').pop() : 'hoa') ?? 'hoa');

// Right-hand SECTIONS, read from the rendered page.
const sections = ref<{ id: string; text: string; level: number }[]>([]);
const activeId = ref('');
onContentUpdated(() => {
  sections.value = [...document.querySelectorAll<HTMLElement>('.man-page h2[id], .man-page h3[id]')].map(h => {
    const clone = h.cloneNode(true) as HTMLElement;
    clone.querySelector('.header-anchor')?.remove();
    return { id: h.id, text: (clone.textContent ?? '').trim(), level: h.tagName === 'H2' ? 2 : 3 };
  });
});

const onScroll = () => {
  const passed = sections.value.filter(s => (document.getElementById(s.id)?.getBoundingClientRect().top ?? 1e9) < 120);
  activeId.value = passed.at(-1)?.id ?? '';
};

// Code-block copy buttons (the default theme wires these; a custom theme must do it itself).
const onClick = (e: MouseEvent) => {
  const btn = e.target instanceof HTMLElement ? e.target.closest<HTMLButtonElement>('button.copy') : null;
  const code = btn?.parentElement?.querySelector('pre');
  if (!btn || !code) return;
  void navigator.clipboard.writeText(code.textContent ?? '').then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1500);
  });
};

const paletteOpen = ref(false);
const onKey = (e: KeyboardEvent) => {
  const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]');
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
    e.preventDefault();
    paletteOpen.value = true;
  }
};

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', onKey);
  document.addEventListener('click', onClick);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('click', onClick);
});

const branch = (i: number, n: number) => (i === n - 1 ? '└─' : '├─');
const github = computed(() => theme.value.socialLinks?.[0]?.link ?? '#');
</script>

<template>
  <div class="term" :class="{ home: isHome }">
    <header class="bar">
      <a class="who" :href="withBase('/')">HOA({{ isHome ? 1 : 7 }})</a>
      <span class="mid">{{ isHome ? 'Harness Orchestrating Agents' : (current?.group ?? 'Manual') }}</span>
      <nav class="tools">
        <button type="button" class="key" @click="paletteOpen = true"><kbd>/</kbd> search</button>
        <button type="button" class="key" :aria-label="isDark ? 'Light theme' : 'Dark theme'" @click="isDark = !isDark">
          [{{ isDark ? 'dark' : 'light' }}]
        </button>
        <a class="key" :href="github" target="_blank" rel="noreferrer">[github]</a>
      </nav>
    </header>

    <!-- 404 -->
    <main v-if="page.isNotFound" class="notfound">
      <p><span class="prompt">$</span> man {{ page.relativePath || 'page' }}</p>
      <p class="err">No manual entry for this page.</p>
      <p><a :href="withBase('/')">cd ~</a> or press <kbd>/</kbd> to search.</p>
    </main>

    <!-- HOME: a terminal session -->
    <main v-else-if="isHome" class="session">
      <div class="window">
        <div class="window-bar"><i /><i /><i /><span>~/projects — zsh</span></div>
        <div class="window-body">
          <pre class="banner" aria-hidden="true">
 _
| |__   ___   __ _
| '_ \ / _ \ / _` |
| | | | (_) | (_| |
|_| |_|\___/ \__,_|   harness orchestrating agents</pre>
          <p class="cmd"><span class="prompt">$</span> man hoa<span class="cursor" /></p>
          <div class="man-page vp-doc-c"><Content /></div>
          <p class="cmd"><span class="prompt">$</span> <span class="hint">press / to search the manual</span></p>
        </div>
      </div>
    </main>

    <!-- DOCS: a man page -->
    <div v-else class="docs">
      <aside class="index">
        <details open>
          <summary>INDEX</summary>
          <div v-for="g in groups" :key="g.text" class="group">
            <div class="group-name">{{ g.text?.toUpperCase() }}</div>
            <a
              v-for="(item, i) in g.items"
              :key="item.link"
              :href="withBase(item.link ?? '/')"
              :class="{ active: item.link === currentLink }"
              ><span class="tree">{{ branch(i, g.items?.length ?? 0) }}</span> {{ item.text }}</a
            >
          </div>
        </details>
      </aside>

      <main class="man-page vp-doc-c">
        <p class="man-head">
          <span>{{ manName }}(7)</span><span>{{ current?.group }}</span><span>{{ manName }}(7)</span>
        </p>
        <Content />
        <nav class="pager">
          <a v-if="prev" :href="withBase(prev.link)">[← {{ prev.text }}]</a><span v-else />
          <a v-if="next" :href="withBase(next.link)">[{{ next.text }} →]</a>
        </nav>
        <p class="man-foot">
          <span>HOA pre-alpha</span
          ><a :href="`${github}/edit/main/apps/website/content/${page.relativePath}`" target="_blank" rel="noreferrer"
            >edit this page</a
          ><span>{{ manName }}(7)</span>
        </p>
      </main>

      <aside class="toc">
        <div v-if="sections.length > 0">
          <div class="group-name">SECTIONS</div>
          <a
            v-for="s in sections"
            :key="s.id"
            :href="`#${s.id}`"
            :class="{ active: s.id === activeId, sub: s.level === 3 }"
            >{{ s.text }}</a
          >
        </div>
      </aside>
    </div>

    <CommandPalette v-model:open="paletteOpen" :pages="pages" :sections="sections" />
    <PrototypeSwitcher current="c" />
  </div>
</template>
