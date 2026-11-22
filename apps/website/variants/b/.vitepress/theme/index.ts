import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import PrototypeSwitcher from '../../../../shared/PrototypeSwitcher.vue';
import ProductHome from './ProductHome.vue';
import './custom.css';

// PROTOTYPE (#435) variant B — "Product story": marketing landing first, docs split per section.
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'layout-bottom': () => h(PrototypeSwitcher, { current: 'b' }) }),
  enhanceApp: ({ app }) => {
    app.component('ProductHome', ProductHome);
  },
} satisfies Theme;
