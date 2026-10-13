import styles from './verification.module.css';

/** The golden FORMAL ✓ badge: a Lean proof of the coin's theorem passed the checker and the review (Σ 100). */
export function VerificationBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`${styles.formal} ${small ? styles.formalSmall : ''}`} title="Formally verified: a Lean 4 proof of this coin's theorem was checked and reviewed">
      FORMAL ✓
    </span>
  );
}
