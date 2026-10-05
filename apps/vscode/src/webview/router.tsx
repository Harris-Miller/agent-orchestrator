import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { AppLayout } from './AppLayout.tsx';
import { SessionHome } from './SessionHome.tsx';
import { SettingsCategoryPage } from './settings/SettingsCategoryPage.tsx';
import { SettingsListPage } from './settings/SettingsListPage.tsx';

const rootRoute = createRootRoute({
  component: AppLayout,
});

const homeRoute = createRoute({
  component: SessionHome,
  getParentRoute: () => rootRoute,
  path: '/',
});

const settingsRoute = createRoute({
  component: SettingsListPage,
  getParentRoute: () => rootRoute,
  path: '/settings',
});

const settingsCategoryRoute = createRoute({
  component: SettingsCategoryPage,
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
