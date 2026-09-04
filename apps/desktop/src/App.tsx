import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createRouter, RouterProvider } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';
import { theme } from './theme';

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
  <ThemeProvider noSsr theme={theme}>
    <CssBaseline />
    <Container
      disableGutters
      maxWidth={false}
      sx={muiTheme => ({ minHeight: '100vh', minWidth: muiTheme.breakpoints.values.md })}
    >
      <RouterProvider router={router} />
    </Container>
  </ThemeProvider>
);

export default App;
