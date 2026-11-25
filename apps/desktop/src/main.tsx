import './bindHostRuntime.ts';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

// `dragDropEnabled: false` (tauri.conf.json) lets the webview see file drops, so a drop outside the Composer would
// navigate the window to the file. Claim every file drag here; the Composer's own handlers run first and attach.
const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true;
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, event => {
    if (hasFiles(event)) {
      event.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
