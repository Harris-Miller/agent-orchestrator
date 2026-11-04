/** JetBrains AIR `_meta.jetbrains.air` envelope. Initialize and `session/list` share it. */

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
