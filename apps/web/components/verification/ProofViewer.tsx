'use client';

import { useMemo } from 'react';
import { tokenizeLean } from './lean';
import styles from './verification.module.css';

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/** A Lean proof, syntax-coloured, with a download and an IPFS link (brief §7.4). */
export function ProofViewer({ source, ipfsCid, fileName = 'proof.lean' }: { source: string; ipfsCid?: string | null; fileName?: string }) {
  const tokens = useMemo(() => tokenizeLean(source), [source]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={styles.viewer}>
      <pre className={styles.code}>
        {tokens.map((t, i) => (t.kind === 'plain' ? t.text : <span key={i} className={styles[t.kind]}>{t.text}</span>))}
      </pre>
      <div className={styles.viewerBar}>
        <button type="button" className={styles.linkBtn} onClick={download}>
          Download .lean
        </button>
        {ipfsCid && (
          <a href={`${IPFS_GATEWAY}${ipfsCid}`} target="_blank" rel="noopener noreferrer">
            View on IPFS
          </a>
        )}
      </div>
    </div>
  );
}
