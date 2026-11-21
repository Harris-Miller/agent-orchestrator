/** Only http(s) URLs may be opened from an agent's URL-mode elicitation. */
export const isOpenableUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};
