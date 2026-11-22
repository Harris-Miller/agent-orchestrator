<script setup lang="ts">
/** PROTOTYPE (#435) variant C — keyboard-first palette over every page and the current page's sections. */
import { useRouter, withBase } from 'vitepress';
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  pages: readonly { text: string; link: string; group: string }[];
  sections: readonly { id: string; text: string }[];
}>();
const open = defineModel<boolean>('open', { required: true });

const router = useRouter();
const query = ref('');
const selected = ref(0);
const input = ref<HTMLInputElement | null>(null);

/** Subsequence match ("gtst" finds "Getting started"); lower score = better. */
const score = (text: string, q: string): number | undefined => {
  const t = text.toLowerCase();
  let at = -1;
  let gaps = 0;
  for (const ch of q.toLowerCase()) {
    const found = t.indexOf(ch, at + 1);
    if (found === -1) return undefined;
    gaps += found - at - 1;
    at = found;
  }
  return gaps;
};

const items = computed(() => {
  const all = [
    ...props.sections.map(s => ({ label: `§ ${s.text}`, hint: 'this page', href: `#${s.id}` })),
    ...props.pages.map(p => ({ label: p.text, hint: p.group, href: withBase(p.link) })),
  ];
  const q = query.value.trim();
  if (q === '') return all;
  return all
    .map(i => ({ i, s: score(`${i.label} ${i.hint}`, q) }))
    .filter((x): x is { i: (typeof all)[number]; s: number } => x.s !== undefined)
    .sort((a, b) => a.s - b.s)
    .map(x => x.i);
});

watch(open, async isOpen => {
  if (!isOpen) return;
  query.value = '';
  selected.value = 0;
  await nextTick();
  input.value?.focus();
});
watch(query, () => {
  selected.value = 0;
});

const choose = (href: string | undefined) => {
  open.value = false;
  if (href === undefined) return;
  if (href.startsWith('#')) {
    document.getElementById(href.slice(1))?.scrollIntoView();
    history.replaceState(null, '', href);
  } else {
    void router.go(href);
  }
};

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = false;
  else if (e.key === 'ArrowDown') selected.value = Math.min(selected.value + 1, items.value.length - 1);
  else if (e.key === 'ArrowUp') selected.value = Math.max(selected.value - 1, 0);
  else if (e.key === 'Enter') choose(items.value[selected.value]?.href);
  else return;
  e.preventDefault();
  e.stopPropagation();
};
</script>

<template>
  <div v-if="open" class="palette-backdrop" @click.self="open = false">
    <div class="palette" role="dialog" aria-label="Search the manual">
      <label class="palette-input">
        <span class="prompt">:</span>
        <input
          ref="input"
          v-model="query"
          type="text"
          placeholder="go to page or section…"
          aria-label="Search the manual"
          @keydown="onKey"
        />
        <kbd>esc</kbd>
      </label>
      <ul>
        <li
          v-for="(item, i) in items"
          :key="item.href"
          :class="{ on: i === selected }"
          @mouseenter="selected = i"
          @click="choose(item.href)"
        >
          <span>{{ item.label }}</span><small>{{ item.hint }}</small>
        </li>
        <li v-if="items.length === 0" class="empty">no match</li>
      </ul>
    </div>
  </div>
</template>
