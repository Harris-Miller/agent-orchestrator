<script setup lang="ts">
/**
 * PROTOTYPE (#435) — floating variant switcher. Not part of any design being evaluated.
 * Hops to the same page on a sibling variant (`<root><key>/<path>`); ← / → keys cycle.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { type VariantKey, VARIANTS } from './variants.ts';

const props = defineProps<{ current: VariantKey }>();

const enabled = __PROTOTYPE_SWITCHER__;
const index = VARIANTS.findIndex(v => v.key === props.current);
const variant = VARIANTS[index];
const DEV_PORTS: Record<VariantKey, number> = { a: 5181, b: 5182, c: 5183 };

const go = (step: number) => {
  const target = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length];
  const currentBase = `${__WEBSITE_ROOT__}${props.current}/`;
  const { pathname, search, hash } = window.location;
  const rest = pathname.startsWith(currentBase) ? pathname.slice(currentBase.length) : '';
  const url = new URL(`${__WEBSITE_ROOT__}${target.key}/${rest}${search}${hash}`, window.location.origin);
  if (import.meta.env.DEV) url.port = String(DEV_PORTS[target.key]);
  window.location.assign(url);
};

const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const el = document.activeElement;
  if (el instanceof HTMLElement && (el.closest('input, textarea, select, [contenteditable]') ?? el.isContentEditable)) {
    return;
  }
  go(e.key === 'ArrowLeft' ? -1 : 1);
};

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="enabled" class="proto-switcher" role="toolbar" aria-label="Prototype variant switcher">
    <button type="button" aria-label="Previous variant" @click="go(-1)">←</button>
    <span class="label">
      <span><strong>{{ variant.key.toUpperCase() }}</strong> · {{ variant.name }}</span>
      <small>{{ index + 1 }}/{{ VARIANTS.length }} · prototype #435</small>
    </span>
    <button type="button" aria-label="Next variant" @click="go(1)">→</button>
  </div>
</template>

<style scoped>
.proto-switcher {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: #ff2d87;
  color: #fff;
  font:
    600 13px/1.2 ui-sans-serif,
    system-ui,
    sans-serif;
  box-shadow:
    0 8px 24px rgb(0 0 0 / 0.35),
    0 0 0 2px #fff;
}
.proto-switcher button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.18);
  color: inherit;
  font-size: 16px;
  cursor: pointer;
}
.proto-switcher button:hover {
  background: rgb(255 255 255 / 0.32);
}
.label {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 150px;
  padding: 0 8px;
  text-align: center;
}
.label small {
  font-weight: 400;
  opacity: 0.8;
  font-size: 11px;
}
</style>
