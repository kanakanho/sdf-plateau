/** gzip helpers based on the web-standard (De)CompressionStream (browsers and Node 18+). */

/** True when the buffer starts with the gzip magic bytes 1f 8b. */
export const isGzip = (buf: ArrayBuffer): boolean => {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  return b.length === 2 && b[0] === 0x1f && b[1] === 0x8b;
};

const pipe = (buf: ArrayBuffer, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> =>
  new Response(new Blob([buf]).stream().pipeThrough(stream)).arrayBuffer();

export const gzip = (buf: ArrayBuffer): Promise<ArrayBuffer> => pipe(buf, new CompressionStream('gzip'));

export const gunzip = (buf: ArrayBuffer): Promise<ArrayBuffer> => pipe(buf, new DecompressionStream('gzip'));

/**
 * Decompresses gzip data, or returns the buffer unchanged if it is not gzip — some servers serve
 * `.gz` files with `Content-Encoding: gzip`, in which case the browser has already decoded them.
 */
export const maybeGunzip = async (buf: ArrayBuffer): Promise<ArrayBuffer> => (isGzip(buf) ? gunzip(buf) : buf);
