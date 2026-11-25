// lib/broadcast.ts
//
// In-process pub/sub (no Redis). API routes publish; SSE routes subscribe.
// Delivery is local to this process, which is all a single-server local app needs.
import { GLOBAL_SCOPE } from "./sseScope"

type Listener = (payload: any) => void

const listeners = new Map<string, Set<Listener>>()

function addListener(channel: string, fn: Listener): () => void {
  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(fn)
  return () => {
    listeners.get(channel)?.delete(fn)
    if (listeners.get(channel)?.size === 0) listeners.delete(channel)
  }
}

function dispatch(channel: string, payload: object): void {
  const subs = listeners.get(channel)
  if (!subs) return
  for (const fn of subs) fn(payload)
}

export async function broadcast(channel: string, payload: object): Promise<void> {
  dispatch(channel, payload)
}

export function subscribe(channel: string, fn: Listener): () => void {
  return addListener(channel, fn)
}

export const publish = broadcast

export function broadcastScoped(
  channel: string,
  payload: object,
  orgPath?: string | null,
): Promise<void> {
  return broadcast(channel, { ...payload, orgPath: orgPath ?? null })
}

export function broadcastGlobal(channel: string, payload: object): Promise<void> {
  return broadcast(channel, { ...payload, orgPath: GLOBAL_SCOPE })
}