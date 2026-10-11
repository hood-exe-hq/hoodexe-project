import styles from './minesweeper.module.css';

/** Segments a–g of a 13 × 23 seven-segment digit (a top, then clockwise, g the middle). */
const SEGMENTS = [
  '2,1 11,1 9,3 4,3',
  '12,2 12,10.5 10,9.5 10,4',
  '12,12.5 12,21 10,19 10,13.5',
  '4,20 9,20 11,22 2,22',
  '1,12.5 3,13.5 3,19 1,21',
  '1,2 3,4 3,9.5 1,10.5',
  '2,11.5 4,10.5 9,10.5 11,11.5 9,12.5 4,12.5',
];

/** Which of a–g are lit, per character. */
const LIT: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
};

function Digit({ ch }: { ch: string }) {
  const lit = LIT[ch] ?? '';
  return (
    <svg className={styles.digit} viewBox="0 0 13 23" aria-hidden="true">
      {SEGMENTS.map((points, i) => (
        <polygon key={i} points={points} className={lit.includes('abcdefg'[i]) ? styles.segOn : styles.segOff} />
      ))}
    </svg>
  );
}

/** Three digits as Windows shows them: zero-padded, a leading minus below zero, clamped to −99…999. */
export function counterText(value: number): string {
  const v = Math.max(-99, Math.min(999, Math.trunc(value)));
  return v < 0 ? `-${String(-v).padStart(2, '0')}` : String(v).padStart(3, '0');
}

/** The red-on-black LCD counter (mines left, or the timer). */
export function Counter({ value, label, timer = false }: { value: number; label: string; timer?: boolean }) {
  const text = counterText(value);
  return (
    <div className={styles.counter} role={timer ? 'timer' : 'img'} aria-label={`${label}: ${value}`}>
      {[...text].map((ch, i) => (
        <Digit key={i} ch={ch} />
      ))}
    </div>
  );
}
