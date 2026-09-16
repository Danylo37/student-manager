/** A response the client should see as-is: status plus a short reason. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const MAX_BODY_BYTES = 1024 * 1024;

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Body too large');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
