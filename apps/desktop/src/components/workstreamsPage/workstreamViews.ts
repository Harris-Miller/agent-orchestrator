import type { TrackerProvider, TrackerRef } from '@lib/hoa-home';
import { directoryBasename } from '@lib/ui';

export const TRACKER_PROVIDERS: readonly TrackerProvider[] = ['github', 'gitlab', 'jira', 'linear'];

export const TRACKER_LABEL: Readonly<Record<TrackerProvider, string>> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  jira: 'Jira',
  linear: 'Linear',
};

export const trackerChipLabel = (ref: TrackerRef): string => `${TRACKER_LABEL[ref.provider]} ${ref.key}`;

/** A session's folder as the Workstreams rail shows it: the Project basename, or "contextless" under the contextless root. */
export const cwdCaption = (cwd: string): string =>
  cwd.includes('/.hoa/contextless/') ? 'contextless' : directoryBasename(cwd);
