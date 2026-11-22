import type { TrackerProvider, TrackerRef } from '@lib/hoa-home';

export const TRACKER_PROVIDERS: readonly TrackerProvider[] = ['github', 'gitlab', 'jira', 'linear'];

export const TRACKER_LABEL: Readonly<Record<TrackerProvider, string>> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  jira: 'Jira',
  linear: 'Linear',
};

export const trackerChipLabel = (ref: TrackerRef): string => `${TRACKER_LABEL[ref.provider]} ${ref.key}`;
