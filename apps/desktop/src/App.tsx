import { RegistryProvider } from '@effect/atom-react';
import { AppThemeProvider } from '@lib/ui';
import { createRouter, RouterProvider } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

// Set up a Router instance
const router = createRouter({
  defaultPreload: 'intent',
  routeTree,
  scrollRestoration: true,
});

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

/** Registry must wrap AppThemeProvider so theme reads the same atoms Settings hydrate/write. */
const App = () => (
  <RegistryProvider>
    <AppThemeProvider>
      <div className="h-screen">
        <RouterProvider router={router} />
      </div>
    </AppThemeProvider>
  </RegistryProvider>
);

export default App;
