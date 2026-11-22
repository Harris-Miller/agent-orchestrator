import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import PrototypeSwitcher from '../../../../shared/PrototypeSwitcher.vue';
import TerminalHome from './TerminalHome.vue';
import '../../../a/.vitepress/theme/custom.css';
import './terminal.css';

// PROTOTYPE (#435) variant C — variant A's default-theme navigation, with a terminal-session landing page.
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'layout-bottom': () => h(PrototypeSwitcher, { current: 'c' }) }),
  enhanceApp: ({ app }) => {
    app.component('TerminalHome', TerminalHome);
  },
} satisfies Theme;
