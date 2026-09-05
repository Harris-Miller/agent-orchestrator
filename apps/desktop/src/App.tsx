import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import { createRouter, RouterProvider } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';
import { AppThemeProvider } from './ThemeChoice.tsx';

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

const App = () => (
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
);

export default App;
