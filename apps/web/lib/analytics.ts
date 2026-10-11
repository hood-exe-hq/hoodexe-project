import type { PostHog } from 'posthog-js';

/**
 * Product analytics (PostHog), set up to match the Privacy notice: an anonymous ID kept in memory only
 * (no cookies or storage, so no consent banner), no wallet addresses, no autocapture of clicks or text, no
 * session recordings. Without NEXT_PUBLIC_POSTHOG_KEY every call is a no-op. The library loads after the
 * page is interactive, so it adds nothing to the first load.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export type AnalyticsEvent =
  | 'app_opened'
  | 'wallet_connected'
  | 'risk_accepted'
  | 'theorem_scored'
  | 'launch_step_viewed'
  | 'launch_submitted'
  | 'launch_confirmed'
  | 'launch_failed'
  | 'trade_submitted'
  | 'trade_confirmed'
  | 'trade_failed'
  | 'callout_posted'
  | 'game_opened'
  | 'solitaire_started'
  | 'solitaire_won'
  | 'solitaire_closed'
  | 'minesweeper_started'
  | 'minesweeper_won'
  | 'minesweeper_lost'
  | 'minesweeper_difficulty_changed';

type Props = Record<string, string | number | boolean | null | undefined>;

let client: PostHog | null = null;
let loading = false;
const queued: [AnalyticsEvent, Props | undefined][] = [];

export function startAnalytics() {
  if (!KEY || loading || typeof window === 'undefined') return;
  loading = true;
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST,
      persistence: 'memory',
      person_profiles: 'never',
      autocapture: false,
      capture_dead_clicks: false,
      enable_heatmaps: false,
      capture_pageview: 'history_change',
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      capture_exceptions: true,
      capture_performance: { web_vitals: true, network_timing: false },
    });
    client = posthog;
    for (const [event, props] of queued.splice(0)) posthog.capture(event, props);
  });
}

/** Records an event. Never pass wallet addresses or anything the user typed. */
export function track(event: AnalyticsEvent, props?: Props) {
  if (!KEY) return;
  if (client) client.capture(event, props);
  else if (queued.length < 50) queued.push([event, props]);
}

/** A short, address-free reason for a failed transaction. */
export const failureReason = (message: string) => message.replace(/0x[0-9a-fA-F]{6,}/g, '0x…').slice(0, 80);
