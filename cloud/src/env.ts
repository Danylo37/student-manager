// Bindings come from `wrangler types` (worker-configuration.d.ts); secrets are
// set with `wrangler secret put` and are not in the generated file.
export interface Env extends CloudflareBindings {
  BOT_TOKEN: string;
  DEVICE_SECRET: string;
  WEBHOOK_SECRET: string;
  /** Comma-separated Telegram user ids that may use the bot and the Mini App. */
  ALLOWED_TG_IDS: string;
}

export const allowedIds = (env: Env) =>
  env.ALLOWED_TG_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const isAllowed = (env: Env, userId: number) => allowedIds(env).includes(String(userId));
