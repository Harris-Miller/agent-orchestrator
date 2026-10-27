/** Encode image bytes as a `data:<mime>;base64,…` URL for `<img src>`. */
export const imageBytesToDataUrl = (bytes: Uint8Array, mimeType: string): string => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const DATA_URL_BASE64_RE = /^data:([^;,]+);base64,(.+)$/is;

export type ParsedDataUrlBase64 = {
  readonly data: string;
  readonly mimeType: string;
};

/** Parse `data:<mime>;base64,<payload>` → mime + payload, or `undefined` if not that shape. */
export const parseDataUrlBase64 = (dataUrl: string): ParsedDataUrlBase64 | undefined => {
  const match = DATA_URL_BASE64_RE.exec(dataUrl);
  if (match === null) {
    return undefined;
  }
  return { data: match[2], mimeType: match[1] };
};

/** Strip `data:<mime>;base64,<payload>` → base64 payload, or `undefined` if not that shape. */
export const base64FromDataUrl = (dataUrl: string): string | undefined => parseDataUrlBase64(dataUrl)?.data;
