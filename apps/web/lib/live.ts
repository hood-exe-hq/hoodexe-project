'use client';

import { create } from 'zustand';
import { fetchCallouts, fetchRecentActivity, liveMessageSchema, liveUrl, type Activity, type Callout, type Reactions } from './api';

export type LiveEvent =
  | { type: 'callout'; callout: Callout }
  | { type: 'reactions'; id: string; reactions: Reactions }
  | { type: 'activity'; activity: Activity };
type Status = 'idle' | 'connecting' | 'live' | 'polling';

/** Connection state for the Callouts header ("🟢 LIVE" vs reconnecting). */
export const useLiveStatus = create<{ status: Status }>(() => ({ status: 'idle' }));

const listeners = new Set<(e: LiveEvent) => void>();

/** Subscribes to new callouts, reaction updates and notable trades. Events can repeat (socket + poll); dedupe by id. */
export function onLive(listener: (e: LiveEvent) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const emit = (e: LiveEvent) => {
  for (const l of listeners) l(e);
};

/** The API's cursor format (base64url of "createdAt|id"), so the poller can resume after a socket message. */
const cursorOf = (c: Pick<Callout, 'createdAt' | 'id'>) =>
  btoa(`${new Date(c.createdAt).toISOString()}|${c.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const POLL_MS = 8_000;
const BACKOFF_MIN = 1_000;
const BACKOFF_MAX = 30_000;

let started = 0;
let stopCurrent: (() => void) | null = null;

/**
 * Keeps one live link per page (docs/BRIEF.md §9): a WebSocket with reconnect backoff 1 s → 30 s; while
 * it's down, polls GET /callouts?after=<cursor> and GET /activity/recent every 8 s. Reference-counted: the last caller to stop
 * closes it.
 */
export function startLive(): () => void {
  started++;
  if (started === 1) stopCurrent = connect();
  return () => {
    started--;
    if (started === 0) {
      stopCurrent?.();
      stopCurrent = null;
    }
  };
}

function connect(): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let backoff = BACKOFF_MIN;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  // The newest callout seen, compared as (createdAt, id) like the server's keyset: base64 cursors
  // don't sort chronologically as strings.
  let newest: { at: number; id: string } | null = null;
  const set = (status: Status) => useLiveStatus.setState({ status });

  const remember = (c: Pick<Callout, 'createdAt' | 'id'>) => {
    const at = new Date(c.createdAt).getTime();
    if (!newest || at > newest.at || (at === newest.at && c.id > newest.id)) newest = { at, id: c.id };
  };

  // Where polling starts: whatever is newest right now.
  void fetchCallouts({ limit: 1 })
    .then((p) => p.items[0] && remember(p.items[0]))
    .catch(() => {});

  async function poll() {
    // Recent trades come as a window, not after a cursor: listeners drop the ones they've seen.
    void fetchRecentActivity()
      .then((items) => items.forEach((activity) => emit({ type: 'activity', activity })))
      .catch(() => {});
    if (!newest) return;
    try {
      const page = await fetchCallouts({ after: cursorOf({ createdAt: new Date(newest.at).toISOString(), id: newest.id }), limit: 50 });
      for (const c of [...page.items].reverse()) {
        remember(c);
        emit({ type: 'callout', callout: c });
      }
    } catch {
      // Still offline; the next tick tries again.
    }
  }

  const startPolling = () => {
    set('polling');
    pollTimer ??= setInterval(poll, POLL_MS);
  };
  const stopPolling = () => {
    clearInterval(pollTimer);
    pollTimer = undefined;
  };

  function open() {
    const url = liveUrl();
    if (!url || stopped) return startPolling();
    set('connecting');
    ws = new WebSocket(url);
    let pingMs = 25_000;
    // No message for two ping intervals: treat the link as dead even if the socket hasn't noticed.
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ws?.close(), pingMs * 2 + 5_000);
    };
    ws.onopen = () => {
      backoff = BACKOFF_MIN;
      stopPolling();
      set('live');
      armWatchdog();
      // Catch anything posted while the socket was down.
      void poll();
    };
    ws.onmessage = (ev) => {
      armWatchdog();
      let parsed;
      try {
        parsed = liveMessageSchema.safeParse(JSON.parse(String(ev.data)));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const m = parsed.data;
      if (m.type === 'hello') pingMs = m.pingMs;
      else if (m.type === 'callout') {
        remember(m.callout);
        emit(m);
      } else if (m.type === 'reactions' || m.type === 'activity') emit(m);
    };
    ws.onclose = () => {
      clearTimeout(watchdog);
      ws = null;
      if (stopped) return;
      startPolling();
      reconnectTimer = setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
    };
    ws.onerror = () => ws?.close();
  }

  open();
  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearTimeout(watchdog);
    stopPolling();
    ws?.close();
    set('idle');
  };
}
