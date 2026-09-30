import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { DeveloperPanelLayout } from './DeveloperPanelLayout.tsx';
import { ProvidersPage } from './SessionHistory.tsx';
import { SessionHome } from './SessionHome.tsx';

const rootRoute = createRootRoute({
  component: DeveloperPanelLayout,
});

const homeRoute = createRoute({
  component: SessionHome,
  getParentRoute: () => rootRoute,
  path: '/',
});

const providersRoute = createRoute({
  component: ProvidersPage,
  getParentRoute: () => rootRoute,
  path: '/providers',
});

const routeTree = rootRoute.addChildren([homeRoute, providersRoute]);

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
