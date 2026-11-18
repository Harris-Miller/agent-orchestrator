import { defineConfig } from 'oxlint';

export default defineConfig({
  options: { denyWarnings: true, typeAware: true, reportUnusedDisableDirectives: 'error' },
});
