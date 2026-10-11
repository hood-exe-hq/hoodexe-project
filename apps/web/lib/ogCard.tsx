import type { ReactNode } from 'react';
import { rigorTier } from '@hood/shared';
import { logoUrl } from './ipfs';

/** Link-preview images (next/og): an XP window on the sky, 1200 × 630. Inline styles only (Satori). */
export const OG_SIZE = { width: 1200, height: 630 };

const TIER_COLOR = { good: '#2e9a2e', warn: '#c98a00', bad: '#c0392b', none: '#8a8a8a' } as const;

export function XpFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        padding: 44,
        background: 'linear-gradient(180deg, #3f7fe0 0%, #78b0f0 55%, #4f9a2c 55%, #3a7b1a 100%)',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: '12px 12px 4px 4px', border: '4px solid #0831d9', background: '#ece9d8', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
        <div
          style={{
            height: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px 0 24px',
            borderRadius: '8px 8px 0 0',
            background: 'linear-gradient(180deg, #0997ff 0%, #0053ee 12%, #0050ee 85%, #0066ff 100%)',
            color: '#fff',
            fontSize: 32,
            fontWeight: 700,
            textShadow: '2px 2px #0f1089',
          }}
        >
          <span>{title}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['min', 'max', 'close'] as const).map((k) => (
              <div key={k} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '2px solid #fff', background: k === 'close' ? '#e0481f' : '#2a6cf0', fontSize: 28 }}>
                {k === 'min' ? <div style={{ width: 16, height: 4, marginTop: 14, background: '#fff' }} /> : k === 'max' ? <div style={{ width: 20, height: 18, border: '3px solid #fff', borderTopWidth: 5 }} /> : '×'}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '34px 40px 26px' }}>{children}</div>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', fontSize: 22, color: '#4b4b4b' }}>
      <span style={{ fontWeight: 700, color: '#0a246a' }}>hood.exe · Robinhood Chain · routed through Pons</span>
    </div>
  );
}

export function RigorPill({ score }: { score: number | null }) {
  return (
    <div style={{ display: 'flex', padding: '6px 18px', borderRadius: 8, background: TIER_COLOR[rigorTier(score)], color: '#fff', fontSize: 34, fontWeight: 700 }}>
      Σ {score ?? '—'}
    </div>
  );
}

/** The logo as a data URL Satori can draw (PNG/JPEG only), or null to fall back to the ticker's letter. */
export async function logoDataUrl(logo: string): Promise<string | null> {
  const url = logoUrl(logo);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    const type = res.headers.get('content-type')?.split(';')[0] ?? '';
    if (!res.ok || !['image/png', 'image/jpeg'].includes(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 1_000_000) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}
