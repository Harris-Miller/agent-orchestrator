import Box from '@mui/material/Box';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { ProvidersPage } from './SessionHistory.tsx';
import { SessionHome } from './SessionHome.tsx';

const rootRoute = createRootRoute({
  component: () => (
    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <Outlet />
    </Box>
  ),
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
