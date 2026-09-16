import type { AppSnapshotResponse, IntentOf, IntentPayloads, IntentType } from '@shared/types';
import { initData } from './telegram';

// The Worker serves this page and the API from one origin; every request
// carries initData, which is the only authorization the Mini App has.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      authorization: `tma ${initData()}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response
      .json()
      .then((json: { error?: string }) => json.error)
      .catch(() => undefined);
    throw new ApiError(response.status, error ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export const fetchSnapshot = () => request<AppSnapshotResponse>('GET', '/app/snapshot');

export const postIntent = <T extends IntentType>(intent: {
  id: string;
  type: T;
  payload: IntentPayloads[T];
}) => request<IntentOf<T>>('POST', '/app/intent', intent);
