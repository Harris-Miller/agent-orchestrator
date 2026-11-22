/**
 * Request error: an Agent's JSON-RPC error response to a Client→Agent request (glossary: Request error). It is a valid
 * answer, not a transport failure: only a response with a numeric `code` and a `message` counts, so
 * `BackendNotConnected`, `RpcClientError` and plain `Error`s never do.
 */
import { AcpError, acpErrorData, acpErrorMessage } from '@libs/effect-acp';
import { Cause, Option, Predicate, Schema } from 'effect';

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

/** One line for any thrown value: `message` and the agent's details when it has them, JSON otherwise, never `[object Object]`. */
export const describeError = (error: unknown): string => {
  if (!Predicate.isObject(error)) {
    return String(error);
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
