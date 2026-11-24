/**
 * Request error: an Agent's JSON-RPC error response to a Client→Agent request (glossary: Request error). It is a valid
 * answer, not a transport failure: only a response with a numeric `code` and a `message` counts, so
 * `BackendNotConnected`, `RpcClientError` and plain `Error`s never do.
 */
import { AcpError, acpErrorData, acpErrorMessage } from '@lib/effect-acp';
import { Cause, Option, Predicate, Redacted, Schema } from 'effect';

export const isAcpError: (value: unknown) => value is AcpError = Schema.is(AcpError);

/** The Agent's response a failed or died request carries, if it carries one. */
export const acpErrorOfCause = (cause: Cause.Cause<unknown>): AcpError | undefined => {
  const error = Cause.squash(cause);
  return isAcpError(error) ? error : undefined;
};

const decodeMessage = Schema.decodeUnknownOption(Schema.Struct({ message: Schema.String }));
const decodeDetails = Schema.decodeUnknownOption(Schema.Struct({ details: Schema.String }));

const detailsOf = (data: unknown): string | undefined =>
  Option.getOrUndefined(Option.map(decodeDetails(data), ({ details }) => details));

/** The agent's own explanation (`data.details`), when it gave one as text. For the user only: never log it. */
export const requestErrorDetails = (error: AcpError): string | undefined => detailsOf(acpErrorData(error));

/**
 * An error's `detail`: Agent text it carries for the user (an Agent's rejection quoted by a Handoff or spawn refusal).
 * Redacted, so the error's `message` and every log or span of it stay free of Private data.
 */
export const RequestErrorDetail = Schema.optionalKey(Schema.Redacted(Schema.String));

/** One line for any thrown value: `message` and the agent's details when it has them, JSON otherwise, never `[object Object]`. */
export const describeError = (error: unknown): string => {
  if (!Predicate.isObject(error)) {
    return String(error);
  }
  if ('detail' in error && Redacted.isRedacted(error.detail)) {
    const { detail, ...rest } = error;
    return `${describeError(error instanceof Error ? error.message : rest)}: ${String(Redacted.value(detail))}`;
  }
  if (isAcpError(error)) {
    const details = requestErrorDetails(error);
    return details === undefined ? acpErrorMessage(error) : `${acpErrorMessage(error)}: ${details}`;
  }
  const decoded = decodeMessage(error);
  if (Option.isNone(decoded)) {
    return JSON.stringify(error);
  }
  const details = 'data' in error ? detailsOf(error.data) : undefined;
  return details === undefined ? decoded.value.message : `${decoded.value.message}: ${details}`;
};

/** The Agent's text for the user from `error`, redacted: the value for a {@link RequestErrorDetail} field. */
export const requestErrorDetail = (error: AcpError): Redacted.Redacted => Redacted.make(describeError(error));
