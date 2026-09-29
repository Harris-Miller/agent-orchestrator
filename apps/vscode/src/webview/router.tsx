import Box from '@mui/material/Box';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

import { SessionChatPage } from './SessionChatPage.tsx';
import { ProvidersPage, SessionHistory } from './SessionHistory.tsx';

const rootRoute = createRootRoute({
  component: () => (
    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <Outlet />
    </Box>
  ),
});

const historyRoute = createRoute({
  component: SessionHistory,
  getParentRoute: () => rootRoute,
  path: '/',
});

const chatRoute = createRoute({
  component: SessionChatPage,
  getParentRoute: () => rootRoute,
  path: '/session/$sessionId',
});

const providersRoute = createRoute({
  component: ProvidersPage,
  getParentRoute: () => rootRoute,
  path: '/providers',
});

const routeTree = rootRoute.addChildren([historyRoute, chatRoute, providersRoute]);

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
