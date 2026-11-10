import { RegistryProvider } from '@effect/atom-react';
import { AppThemeProvider, AtomDebugBridge } from '@lib/ui';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
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
    {import.meta.env.DEV ? <AtomDebugBridge /> : null}
    <AppThemeProvider>
      <CssBaseline />
      <Container
        disableGutters
        maxWidth={false}
        sx={muiTheme => ({ minHeight: '100vh', minWidth: muiTheme.breakpoints.values.md })}
      >
        <RouterProvider router={router} />
      </Container>
    </AppThemeProvider>
  </RegistryProvider>
);

export default App;
