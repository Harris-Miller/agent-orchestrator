/** Remembers the last settled value of a boolean setting; `changed` is true only when a later value differs (never for the first). */
export const makeChangeTracker = () => {
  let last: boolean | undefined;
  return {
    changed: (next: boolean): boolean => {
      const result = last !== undefined && last !== next;
      last = next;
      return result;
    },
  };
};
