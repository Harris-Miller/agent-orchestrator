import { assert, describe, it } from '@effect/vitest';
import { bindHostRuntime, createHostRuntime } from '@lib/ui/host-runtime';
import { ThemeProvider } from '@mui/material/styles';
import { Layer } from 'effect';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { NewSessionLauncherViewProps } from './NewSessionLauncher.tsx';

// The view only reads atoms for display labels, so an empty Host layer is enough to load @lib/ui.
bindHostRuntime(createHostRuntime(Layer.empty as Parameters<typeof createHostRuntime>[0]));
const { theme } = await import('@lib/ui');
const { NewSessionLauncherView } = await import('./NewSessionLauncher.tsx');

// Presentational view only: the desktop package has no DOM test environment, so clicks are covered by the atoms'
// own tests (setVirtualLaunchTarget / patchVirtualSession).
const render = (props: Partial<NewSessionLauncherViewProps>) =>
  renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(NewSessionLauncherView, {
        cwd: undefined,
        disabled: false,
        launchTarget: undefined,
        onPickProject: () => undefined,
        onPickTarget: () => undefined,
        projects: [],
        projectsLoaded: true,
        targets: [],
        ...props,
      }),
    ),
  );

describe('NewSessionLauncher', () => {
  it('shows a tile per agent with the selected one pressed', () => {
    const html = render({ launchTarget: 'codex-acp', targets: ['codex-acp', 'claude-agent-acp'] });
    assert.include(html, 'What are we building?');
    assert.strictEqual(html.match(/aria-pressed="true"/g)?.length, 1);
    assert.strictEqual(html.match(/<button/g)?.length, 2);
    assert.include(html, 'role="group"');
    assert.include(html, 'aria-label="Agent"');
  });

  it('shows a pill per project and marks the selected one', () => {
    const html = render({ cwd: '/a/alpha', projects: ['/a/alpha', '/b/beta'] });
    assert.include(html, 'alpha');
    assert.include(html, 'beta');
    assert.strictEqual(html.match(/aria-pressed="true"/g)?.length, 1);
    assert.notInclude(html, 'No projects yet');
    assert.include(html, 'aria-label="Project"');
  });

  it('shows the hint when loaded with no projects', () => {
    assert.include(render({}), 'No projects yet.');
  });

  it('shows no hint before projects have loaded', () => {
    const html = render({ projectsLoaded: false });
    assert.notInclude(html, 'No projects yet');
    assert.notInclude(html, 'aria-label="Project"');
  });

  it('disables tiles and pills while disabled', () => {
    const html = render({ disabled: true, projects: ['/a/alpha'], targets: ['codex-acp'] });
    assert.strictEqual(html.match(/disabled=""/g)?.length, 2);
  });

  it('disables unselectable targets and shows the reason', () => {
    const html = render({
      usableTargets: ['codex-acp'],
      targets: ['codex-acp', 'claude-agent-acp'],
      unavailableReasons: { 'claude-agent-acp': 'Not installed' },
    });
    assert.strictEqual(html.match(/disabled=""/g)?.length, 1);
    assert.include(html, 'Not installed');
  });
});
