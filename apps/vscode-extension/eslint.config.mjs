import config from '@tooling/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([...config, globalIgnores(['out'])]);
