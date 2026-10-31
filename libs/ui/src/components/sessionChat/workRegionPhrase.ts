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

// In-memory only: stable across session switches, re-rolled when the session is deactivated.
const bySession = new Map<string, Map<string, string>>();

export const workRegionPhrase = (sessionId: string, regionId: string): string => {
  const regions = bySession.get(sessionId) ?? new Map<string, string>();
  bySession.set(sessionId, regions);
  const existing = regions.get(regionId);
  if (existing !== undefined) return existing;
  const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  regions.set(regionId, phrase);
  return phrase;
};

export const clearWorkRegionPhrases = (sessionId: string): void => {
  bySession.delete(sessionId);
};
