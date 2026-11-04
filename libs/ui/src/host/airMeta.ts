/** JetBrains AIR `_meta.jetbrains.air` envelope. Initialize and `session/list` share it. */

import { isRecord } from '../isRecord.ts';

export const airCapability = {
  sessionArchive: 'sessionArchive',
  sessionIndex: 'sessionIndex',
  sessionRename: 'sessionRename',
} as const;

export type AirCapability = (typeof airCapability)[keyof typeof airCapability];

export const airMeta = <Body extends object>(body: Body) => ({
  jetbrains: {
    air: {
      ...body,
      version: 1 as const,
    },
  },
});

/** True when a `session/list` row carries `_meta.jetbrains.air.archived === true`. */
export const isArchivedEntry = (entry: Readonly<Record<string, unknown>>): boolean => {
  const { _meta: meta } = entry;
  if (!isRecord(meta) || !isRecord(meta.jetbrains) || !isRecord(meta.jetbrains.air)) {
    return false;
  }
  return meta.jetbrains.air.archived === true;
};
