import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import PrototypeSwitcher from '../../../../shared/PrototypeSwitcher.vue';
import ProductHome from '../../../b/.vitepress/theme/ProductHome.vue';
import '../../../a/.vitepress/theme/custom.css';
import './landing.css';

// PROTOTYPE (#435) variant C — variant A's navigation (theme + nav/sidebar/search) with variant B's landing page.
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'layout-bottom': () => h(PrototypeSwitcher, { current: 'c' }) }),
  enhanceApp: ({ app }) => {
    app.component('ProductHome', ProductHome);
  },
} satisfies Theme;
