/** Context-window fill and cost for one session, as last reported by the agent. In memory only. */
export type SessionUsage = {
  // some providers omit the `cost` key, others include it set to `undefined`
  readonly cost?: { readonly amount: number; readonly currency: string } | undefined;
  readonly size: number;
  readonly used: number;
};
