/** Encode image bytes as a `data:<mime>;base64,…` URL for `<img src>`. */
export const imageBytesToDataUrl = (bytes: Uint8Array, mimeType: string): string => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const DATA_URL_BASE64_RE = /^data:([^;,]+);base64,(.+)$/s;

/** Strip `data:<mime>;base64,<payload>` → base64 payload, or `undefined` if not that shape. */
export const base64FromDataUrl = (dataUrl: string): string | undefined => {
  const match = DATA_URL_BASE64_RE.exec(dataUrl);
  return match?.[2];
};
