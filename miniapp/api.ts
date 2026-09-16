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

const TIMEOUT_MS = 15_000;

export const isNetworkError = (error: unknown) => !(error instanceof ApiError);

/** A refusal of the initData itself; a retry cannot fix either, so the text says what can. */
export function deniedText(status: number | null): string | null {
  if (status === 401) return 'Сесія Telegram застаріла: закрийте застосунок і відкрийте знову.';
  if (status === 403) return 'Немає доступу. Перевірте, чи ваш Telegram-id у білому списку бота.';
  return null;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      authorization: `tma ${initData()}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
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

/**
 * The id makes the request idempotent, so a timeout is retried with the same id:
 * the cloud answers with the record it already has instead of a second one.
 */
export async function postIntent<T extends IntentType>(intent: {
  id: string;
  type: T;
  payload: IntentPayloads[T];
}): Promise<IntentOf<T>> {
  try {
    return await request<IntentOf<T>>('POST', '/app/intent', intent);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return request<IntentOf<T>>('POST', '/app/intent', intent);
  }
}
