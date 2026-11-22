import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import PrototypeSwitcher from '../../../../shared/PrototypeSwitcher.vue';
import './custom.css';

// PROTOTYPE (#435) variant A — "Docs-first": the stock VitePress default theme, branded.
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'layout-bottom': () => h(PrototypeSwitcher, { current: 'a' }) }),
} satisfies Theme;
