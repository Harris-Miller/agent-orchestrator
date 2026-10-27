/** Encode image bytes as a `data:<mime>;base64,…` URL for `<img src>`. */
export const imageBytesToDataUrl = (bytes: Uint8Array, mimeType: string): string => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};
