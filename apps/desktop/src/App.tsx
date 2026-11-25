import { RegistryProvider } from '@effect/atom-react';
import { AppThemeProvider, DirectoryPickerContext } from '@lib/ui';
import type { DirectoryPickerRenderer } from '@lib/ui';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import { createRouter, RouterProvider } from '@tanstack/react-router';

import { CreateSessionDirectoryPicker } from './components/workbenchNavRail/CreateSessionDirectoryPicker.tsx';
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

/** The desktop directory picker for the Additional directories editors. */
const renderDesktopDirectoryPicker: DirectoryPickerRenderer = ({ onClose, onSelect }) => (
  <CreateSessionDirectoryPicker
    allowWorkspaceFile={false}
    confirmLabel="Add"
    onClose={onClose}
    onSelectDirectory={onSelect}
  />
);

/** Registry must wrap AppThemeProvider so theme reads the same atoms Settings hydrate/write. */
const App = () => (
  <RegistryProvider>
    <AppThemeProvider>
      <CssBaseline />
      <Container
        disableGutters
        maxWidth={false}
        sx={muiTheme => ({ minHeight: '100vh', minWidth: muiTheme.breakpoints.values.md })}
      >
        <DirectoryPickerContext.Provider value={renderDesktopDirectoryPicker}>
          <RouterProvider router={router} />
        </DirectoryPickerContext.Provider>
      </Container>
    </AppThemeProvider>
  </RegistryProvider>
);

export default App;
