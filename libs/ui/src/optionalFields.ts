/** Small helpers for tolerant decoding of optional wire fields. */
export const optString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** Drop `undefined` values (exactOptionalPropertyTypes forbids explicit `undefined`). */
export const withoutUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
