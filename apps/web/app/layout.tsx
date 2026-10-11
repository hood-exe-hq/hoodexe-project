import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { X_HANDLE } from '@/lib/social';
import './globals.css';

// Absolute URLs for link previews: NEXT_PUBLIC_SITE_URL, else the production domain.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hoodexe.site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'hood.exe',
  description: 'Launch coins backed by theorems. Trade on provable rigor. Powered by Robinhood Chain, routed through Pons.',
  applicationName: 'hood.exe',
  openGraph: {
    title: 'hood.exe — Mathematical Superintelligence. On-chain.',
    description: 'Launch coins. Prove theorems. Trade intelligently.',
    siteName: 'hood.exe',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'hood.exe', site: `@${X_HANDLE}` },
};

export const viewport: Viewport = {
  themeColor: '#245edc',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
