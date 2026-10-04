export const truncateSessionId = (sessionId: string): string =>
  sessionId.length > 12 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}` : sessionId;
