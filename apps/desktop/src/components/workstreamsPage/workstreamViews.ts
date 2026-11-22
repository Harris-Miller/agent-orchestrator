import { TrackerProviderSchema } from '@lib/hoa-home';
import type { TrackerProvider, TrackerRef } from '@lib/hoa-home';

export const TRACKER_PROVIDERS: readonly TrackerProvider[] = TrackerProviderSchema.literals;

export const TRACKER_LABEL: Readonly<Record<TrackerProvider, string>> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  jira: 'Jira',
  linear: 'Linear',
};

export const trackerChipLabel = (ref: TrackerRef): string => `${TRACKER_LABEL[ref.provider]} ${ref.key}`;
