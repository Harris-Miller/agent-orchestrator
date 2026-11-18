/** Credential redaction for the developer panel's RPC wire log: MCP server `headers` / `env` values (ACP: "credentials"). */
import { Predicate } from 'effect';

export const REDACTED = '[redacted]';

const redactNameValues = (entries: unknown): unknown =>
  Array.isArray(entries)
    ? entries.map((entry: unknown) => (Predicate.isObject(entry) ? { ...entry, value: REDACTED } : entry))
    : entries;

const redactServer = (server: unknown): unknown =>
  Predicate.isObject(server)
    ? {
        ...server,
        ...('headers' in server ? { headers: redactNameValues(server.headers) } : {}),
        ...('env' in server ? { env: redactNameValues(server.env) } : {}),
      }
    : server;

/** `message` with every `payload.mcpServers[]` credential value masked; anything else is returned untouched. */
export const redactRpcWireMessage = (message: unknown): unknown => {
  if (!Predicate.isObject(message) || !Predicate.isObject(message.payload)) {
    return message;
  }
  const { mcpServers } = message.payload;
  if (!Array.isArray(mcpServers)) {
    return message;
  }
  return { ...message, payload: { ...message.payload, mcpServers: mcpServers.map(redactServer) } };
};
