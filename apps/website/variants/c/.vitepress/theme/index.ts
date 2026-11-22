import type { Theme } from 'vitepress';
import Layout from './Layout.vue';
import './style.css';

// PROTOTYPE (#435) variant C — "Terminal manual": custom Layout, command palette, man-page chrome.
export default { Layout } satisfies Theme;
