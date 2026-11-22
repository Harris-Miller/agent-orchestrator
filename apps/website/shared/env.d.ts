// Ambient declarations: `*.vue` modules and the Vite `define` globals from shared/site.ts.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

/** True when the build/dev server was started with WEBSITE_PROTOTYPE=1 (shows the variant switcher). */
declare const __PROTOTYPE_SWITCHER__: boolean;
/** Root path every variant is published under (e.g. `/agent-orchestrator/`); each variant lives at `<root><key>/`. */
declare const __WEBSITE_ROOT__: string;
