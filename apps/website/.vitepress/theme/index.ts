import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import ProductHome from './ProductHome.vue';
import './custom.css';
import './landing.css';

export default {
  extends: DefaultTheme,
  enhanceApp: ({ app }) => {
    app.component('ProductHome', ProductHome);
  },
} satisfies Theme;
