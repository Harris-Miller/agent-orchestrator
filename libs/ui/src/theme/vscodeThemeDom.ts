import { themeFromVscode, vscodeVarName } from './vscodeTheme.ts';
import type { HostTheme } from './vscodeTheme.ts';

/** Reads the active VS Code theme off the `--vscode-*` variables and kind VS Code wrote into the webview document. */
export const readVscodeTheme = (doc: Document): HostTheme => {
  const style = getComputedStyle(doc.documentElement);
  return themeFromVscode(name => style.getPropertyValue(vscodeVarName(name)), doc.body.dataset.vscodeThemeKind);
};

/**
 * Calls `onChange` at most once per frame after VS Code rewrites the theme: it rewrites `<html style>` and the
 * `<body>` class and `data-vscode-theme-kind` together on a theme switch. `<body style>` is not watched, because
 * MUI's scroll lock writes it on every menu or dialog open. Returns the stop function.
 */
export const observeVscodeTheme = (doc: Document, onChange: () => void): (() => void) => {
  let frame: number | undefined;
  const observer = new MutationObserver(() => {
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      onChange();
    });
  });
  observer.observe(doc.documentElement, { attributeFilter: ['style'], attributes: true });
  observer.observe(doc.body, { attributeFilter: ['class', 'data-vscode-theme-kind'], attributes: true });
  return () => {
    observer.disconnect();
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  };
};
