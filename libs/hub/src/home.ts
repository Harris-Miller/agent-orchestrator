import { homedir } from 'node:os';
import { join } from 'node:path';

/** The HOA home (`~/.hoa`) the hub process and its launcher use; `HOA_HOME` overrides it (tests). */
export const hubHome = (): string => process.env.HOA_HOME ?? join(homedir(), '.hoa');
