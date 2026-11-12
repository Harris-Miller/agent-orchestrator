const PHRASES = [
  'Worked for a bit',
  'Worked for a tad',
  'Worked for some length of time',
  'Worked for a spell',
  'Worked for a while',
  'Worked for a hot minute',
  'Worked for a smidge',
  'Worked for an unspecified duration',
  'Worked for a stretch',
  'Worked for some amount of time',
] as const;

/** Stable phrase per region: hashed from its id, so no cache to hold or clear. */
export const workRegionPhrase = (regionId: string): string => {
  let hash = 0;
  for (const char of regionId) hash = (hash * 31 + char.charCodeAt(0)) % PHRASES.length;
  return PHRASES[hash];
};
