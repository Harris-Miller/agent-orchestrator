import { createRoot } from 'react-dom/client';

import { HelloWorld } from './HelloWorld';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Missing #root element for Agent Orchestrator webview');
}

createRoot(rootElement).render(<HelloWorld />);
