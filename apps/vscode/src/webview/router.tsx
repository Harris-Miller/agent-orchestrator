import { createMemoryHistory, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';

import { AppLayout } from './AppLayout.tsx';
import { SessionHome } from './SessionHome.tsx';
import { SettingsPage } from './settings/SettingsPage.tsx';
import { isSettingsCategoryId } from '@lib/ui';

const rootRoute = createRootRoute({
  component: AppLayout,
});

const homeRoute = createRoute({
  component: SessionHome,
  getParentRoute: () => rootRoute,
  path: '/',
});

const settingsRoute = createRoute({
  beforeLoad: () => {
    // oxlint-disable-next-line typescript/only-throw-error -- Router redirect control flow
    throw redirect({ to: '/settings/$category', params: { category: 'general' } });
  },
  getParentRoute: () => rootRoute,
  path: '/settings',
});

const settingsCategoryRoute = createRoute({
  component: SettingsPage,
  beforeLoad: ({ params }) => {
    if (!isSettingsCategoryId(params.category)) {
      // oxlint-disable-next-line typescript/only-throw-error -- Router redirect control flow
      throw redirect({ to: '/settings/$category', params: { category: 'general' } });
    }
  },
  getParentRoute: () => rootRoute,
  path: '/settings/$category',
});

const routeTree = rootRoute.addChildren([homeRoute, settingsRoute, settingsCategoryRoute]);

const memoryHistory = createMemoryHistory({
  initialEntries: ['/'],
});

export const router = createRouter({
  history: memoryHistory,
  routeTree,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
