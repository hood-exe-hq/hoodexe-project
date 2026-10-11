import styles from './minesweeper.module.css';

export type Face = 'default' | 'pressed' | 'win' | 'dead';

const LABEL: Record<Face, string> = {
  default: 'New game',
  pressed: 'New game',
  win: 'You won! New game',
  dead: 'Game over. New game',
};

/** The face drawn on a 26-unit grid, pixel-art style (crisp edges). */
function FaceIcon({ face }: { face: Face }) {
  return (
    <svg className={styles.face} viewBox="0 0 26 26" aria-hidden="true" shapeRendering="crispEdges">
      <circle cx="13" cy="13" r="10.5" fill="#ffff00" stroke="#000" strokeWidth="1.4" />
      {face === 'win' ? (
        <>
          {/* sunglasses */}
          <path d="M5 10 H21 V11 H20 V13 Q20 15 18 15 H16 Q14 15 14 13 V11 H12 V13 Q12 15 10 15 H8 Q6 15 6 13 V11 H5 Z" fill="#000" />
          <path d="M5 10 L3 8.5 M21 10 L23 8.5" stroke="#000" strokeWidth="1" />
        </>
      ) : face === 'dead' ? (
        <path d="M7.5 8.5 L11 12 M11 8.5 L7.5 12 M15 8.5 L18.5 12 M18.5 8.5 L15 12" stroke="#000" strokeWidth="1.3" />
      ) : (
        <>
          <rect x="8" y="9" width="2.4" height="2.4" fill="#000" />
          <rect x="15.6" y="9" width="2.4" height="2.4" fill="#000" />
        </>
      )}
      {face === 'pressed' ? (
        <ellipse cx="13" cy="17.5" rx="2.4" ry="2.6" fill="none" stroke="#000" strokeWidth="1.4" />
      ) : face === 'dead' ? (
        <path d="M8.5 19 Q13 14.5 17.5 19" fill="none" stroke="#000" strokeWidth="1.4" />
      ) : (
        <path d="M8 16 Q13 21 18 16" fill="none" stroke="#000" strokeWidth="1.4" />
      )}
    </svg>
  );
}

/** The face button: 🙂 playing, 😮 while a cell is held down, 😎 won, 😵 lost. Click for a new game. */
export function SmileyButton({ face, onClick }: { face: Face; onClick: () => void }) {
  return (
    <button type="button" className={styles.smiley} onClick={onClick} aria-label={LABEL[face]} title="New game (F2)">
      <FaceIcon face={face} />
    </button>
  );
}
