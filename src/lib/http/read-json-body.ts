/**
 * Read a JSON request body against a hard byte ceiling.
 *
 * The ceiling is the abuse bound for every customer JSON endpoint: a 64 KB body
 * is far more than any form on the storefront produces, while a hostile caller
 * can otherwise stream an unbounded body into `req.json()`. The reader stops
 * streaming (and cancels the upstream) the moment the budget is exceeded, so an
 * oversized request costs a single read of a few kilobytes, not the full body.
 *
 * It is intentionally dependency-free (no `next/server`) so the check scripts
 * can exercise it directly with a plain `Request`.
 */
import { JSON_BODY_LIMIT_DEFAULT } from "@/lib/utils/limits";

export type JsonBodyRead<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; error: string };

export async function readJsonBody<T = unknown>(
  req: Request,
  maxBytes: number = JSON_BODY_LIMIT_DEFAULT,
): Promise<JsonBodyRead<T>> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large." };
  }

  const stream = req.body;
  if (!stream) return { ok: false, status: 400, error: "Invalid request." };

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "Request body too large." };
      }
      chunks.push(value);
      if (total > maxBytes * 2) {
        // Unreachable while the cap above holds; guards a pathological stream.
        await reader.cancel();
        return { ok: false, status: 413, error: "Request body too large." };
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) return { ok: false, status: 400, error: "Invalid request." };

  try {
    const text = new TextDecoder().decode(
      chunks.length === 1 ? chunks[0] : concat(chunks, total),
    );
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400, error: "Invalid request." };
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}