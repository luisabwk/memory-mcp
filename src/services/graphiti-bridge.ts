/**
 * Best-effort replacement for the Postgres trigger `notify_graphiti_bridge_on_memory_insert`,
 * which no longer exists once `memories` storage moves to Mongo. The trigger POSTed
 * `{ type: 'INSERT', table: 'memories', record: row_to_json(NEW) }` to
 * https://graphiti-bridge.bloko.dev/webhook/memories on every insert, swallowing any
 * error (`exception when others then raise warning; return NEW`). This preserves that
 * shape and that swallow-on-failure behavior at the application layer instead.
 *
 * SECURITY NOTE: the original trigger had its webhook secret hardcoded in the SQL
 * function body (visible via pg_get_functiondef to anyone who can read pg_proc —
 * flagged separately to Lu, not fixed here). This implementation reads the secret
 * from GRAPHITI_BRIDGE_WEBHOOK_SECRET instead — do not hardcode it, and do not reuse
 * the leaked value; it should be rotated.
 *
 * If GRAPHITI_BRIDGE_WEBHOOK_URL is unset, notification is a no-op (e.g. local dev).
 */

import type { Memory } from '../types/memory.js';

export async function notifyGraphitiBridge(memory: Memory): Promise<void> {
  const url = process.env.GRAPHITI_BRIDGE_WEBHOOK_URL;
  if (!url) return;

  const secret = process.env.GRAPHITI_BRIDGE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('notifyGraphitiBridge: GRAPHITI_BRIDGE_WEBHOOK_URL is set but GRAPHITI_BRIDGE_WEBHOOK_SECRET is missing; skipping notification');
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': secret,
      },
      body: JSON.stringify({ type: 'INSERT', table: 'memories', record: memory }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`notifyGraphitiBridge: webhook responded ${res.status}`);
    }
  } catch (err) {
    console.warn(`notifyGraphitiBridge: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}
