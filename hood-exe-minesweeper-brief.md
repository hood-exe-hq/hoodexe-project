# hood.exe — Minesweeper Addendum

**Scope**: replace the existing Minesweeper "Coming Soon" placeholder with a **fully playable classic XP Minesweeper**.
**Target branch**: `feat/minesweeper`
**Depends on**: existing Games module shipped in `feat/games` (Solitaire). Reuses the window registry, Start Menu → Games submenu, and `/games/minesweeper` route already in place.
**Est. effort**: 1 day
**Owner**: dev
**Reviewer**: Bix

---

## 0. Why

- Completes the "Games" easter egg suite started with Solitaire
- Minesweeper is the single most iconic XP game → highest meme/share value
- Zero backend dependency → no risk, no new infra
- Sets up a future viral mechanic (whitelist via Expert-mode win proof) — not in scope here, but the game logic should emit win events the app can observe later

---

## 1. Deliverables

### 1.1 Remove the placeholder
Delete the "Coming Soon" window UI from the current Minesweeper window. Keep the window registration — just swap the component.

### 1.2 File structure
Add inside existing `apps/web/`:

```
apps/web/
├── app/
│   └── games/
│       └── minesweeper/
│           └── page.tsx                      ← route: /games/minesweeper (updated to render playable game)
├── components/
│   └── games/
│       └── Minesweeper/
│           ├── MinesweeperWindow.tsx         ← XP window wrapper + game shell (replaces placeholder)
│           ├── Minesweeper.tsx               ← pure game component
│           ├── Board.tsx                     ← grid renderer
│           ├── Cell.tsx                      ← single cell renderer
│           ├── SmileyButton.tsx              ← face button (reset)
│           ├── Counter.tsx                   ← 7-segment LCD digits (mines left + timer)
│           ├── useMinesweeper.ts             ← game-state hook
│           ├── minesweeper.types.ts
│           ├── minesweeper.logic.ts          ← pure game logic (board gen, reveal, flag, win check)
│           └── minesweeper.module.css
└── public/
    └── icons/
        └── games/
            ├── minesweeper-32.png            ← already exists, update if "SOON" badge was baked in
            ├── minesweeper-16.png
            └── minesweeper-smiley/
                ├── smiley-default.png        ← 🙂
                ├── smiley-pressed.png        ← 😮
                ├── smiley-win.png            ← 😎
                └── smiley-dead.png           ← 😵
```

### 1.3 Update window registry
In the existing `windowRegistry.ts` (or equivalent), update the Minesweeper entry:

```ts
export const APPS = {
  // ... existing apps
  minesweeper: {
    id: 'minesweeper',
    title: 'Minesweeper',
    shortName: 'Minesweeper',
    icon: '/icons/games/minesweeper-32.png',
    width: 350,              // adjusts dynamically per difficulty, this is the default (Beginner)
    height: 420,
    minWidth: 240,
    minHeight: 320,
    component: lazy(() => import('@/components/games/Minesweeper/MinesweeperWindow')),
    taskbarGroup: 'games',
    // REMOVE: comingSoon: true
  },
};
```

### 1.4 Remove "SOON" badge
- Remove the small red "SOON" badge from the desktop icon
- Remove the "SOON" tag from the Start Menu → Games entry

---

## 2. Game Rules (classic Windows Minesweeper)

### 2.1 Core rules
- Grid of cells, some contain mines
- Left-click reveals a cell
  - If it contains a mine → game over
  - If it contains a number (1–8) → shows how many mines are in the 8 adjacent cells
  - If it's empty (0 adjacent mines) → auto-reveals in a flood-fill until it hits numbered cells
- Right-click flags/unflags a cell (🚩)
- Right-click on a flagged cell → marks with "?" (question mark) — classic XP behavior, user togglable in Options
- Both-button click (chord click) on a revealed number → if the number of flags around it equals the number itself, auto-reveal all other non-flagged neighbors
- Win when all non-mine cells are revealed
- Lose when a mine is revealed → all mines show, wrong flags marked

### 2.2 First-click safety
- First click NEVER hits a mine
- First click should also NEVER land on a numbered cell (per modern Minesweeper convention) — the first-click cell and all 8 neighbors are guaranteed mine-free, so the first click opens a flood-fill area
- Mines are placed AFTER the first click (deferred board generation)

### 2.3 Difficulty levels
Three preset difficulties (classic XP values) + custom:

| Difficulty | Grid | Mines | Density |
|---|---|---|---|
| Beginner | 9 × 9 | 10 | 12.3% |
| Intermediate | 16 × 16 | 40 | 15.6% |
| Expert | 30 × 16 | 99 | 20.6% |
| Custom | user-defined (max 30×24, mines must leave ≥ 9 safe cells) | custom | — |

User's choice persists in localStorage.

---

## 3. UI Spec

### 3.1 Window layout
```
┌─ Minesweeper (XP title bar) ────────── _ □ × ┐
│ Game  Help                                   │ ← menu bar
├──────────────────────────────────────────────┤
│ ╔════════════════════════════════════════╗   │
│ ║ ┌────┐          ┌──────┐        ┌────┐ ║   │ ← outer sunken frame
│ ║ │ 010│          │  🙂  │        │ 000│ ║   │ ← mine counter | smiley | timer
│ ║ └────┘          └──────┘        └────┘ ║   │
│ ╠════════════════════════════════════════╣   │
│ ║ ┌─────────────────────────────────────┐║   │
│ ║ │ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓                  │║   │
│ ║ │ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓                  │║   │ ← cell grid (sunken)
│ ║ │ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓                  │║   │
│ ║ │ ... (9x9 for Beginner)              │║   │
│ ║ └─────────────────────────────────────┘║   │
│ ╚════════════════════════════════════════╝   │
└──────────────────────────────────────────────┘
```

### 3.2 Visual spec (match classic XP exactly)

**Cell dimensions**: 16×16px (classic). Scale up on high-DPI with crisp pixel rendering (`image-rendering: pixelated` or similar for icons).

**Unrevealed cell**:
- Background: `#bdbdbd` (XP mid-grey)
- 3D border: top/left white (`#ffffff`), bottom/right dark grey (`#808080`), 2px chunky
- Flag icon when flagged: red flag 🚩 (bitmap or inline SVG, pixel-art style)
- Question mark when toggled: black `?`, bold

**Revealed cell**:
- Background: `#bdbdbd`
- Border: 1px solid `#7b7b7b` (flat, inset)
- Number (1–8) with these exact classic colors:
  - 1: `#0000ff` (blue)
  - 2: `#008000` (green)
  - 3: `#ff0000` (red)
  - 4: `#000080` (dark blue)
  - 5: `#800000` (maroon)
  - 6: `#008080` (teal)
  - 7: `#000000` (black)
  - 8: `#808080` (grey)
- Font: `"MS Sans Serif", Tahoma, sans-serif`, bold, 11px (classic)

**Mine icon** (revealed on loss): black circle with 8 small spikes radiating out, pixel-art bitmap. Classic Windows design.

**Smiley button** (28×28px minimum):
- Default: 🙂 (yellow face, smiling)
- Pressing left-click anywhere on grid: 😮 (surprised, mouth open)
- Win: 😎 (sunglasses)
- Lose: 😵 (X-eyes)
- Clicking smiley → reset current game (same difficulty)

**7-segment LCD counters** (classic red digits on black background):
- Left counter: mines remaining (= total mines − flags placed). Can go negative if over-flagged.
- Right counter: elapsed time in seconds. Starts on first click, max 999.
- Both show 3 digits, pad with leading zeros.
- Use CSS/SVG for the 7-segment effect (easy: 3 overlapping SVG digit components).

**Frame**: outer sunken border (grey, 3D inset) around the whole game area, mimicking the classic XP "panel inset" look.

### 3.3 Menu bar
- **Game**
  - New (shortcut: F2) → regenerate board, same difficulty
  - Beginner (checkable, shows ✓ if active)
  - Intermediate (checkable)
  - Expert (checkable)
  - Custom... → modal: rows, cols, mines inputs with validation
  - —
  - Marks (?) (checkable, default on) → toggles ? mark behavior
  - —
  - Best Times... → modal: show high scores per difficulty
  - Exit → close window
- **Help**
  - Contents → modal with how-to-play text
  - About Minesweeper → XP-style about dialog

### 3.4 Status bar
Not strictly in classic XP Minesweeper, but useful. OPTIONAL — skip if time-constrained.

---

## 4. Interactions

### 4.1 Mouse
- **Left-click (unrevealed, unflagged cell)** → reveal
- **Left-click (unrevealed, flagged cell)** → nothing (flag protects it)
- **Right-click (unrevealed cell)** → cycle: none → 🚩 → ? → none
- **Left+Right simultaneous OR middle-click (revealed numbered cell)** → chord: if flagged count equals number, reveal all other neighbors
- **Left-click smiley** → reset board
- **Hold left-click on grid (without releasing)** → smiley becomes 😮 (anticipation)

### 4.2 Touch (mobile adaptation)
Mobile has no right-click. Use two modes:
- **Default mode (reveal)**: tap to reveal
- **Flag mode toggle** button in UI → tap to flag/unflag
- **Long-press** (500ms) → flag/unflag (alternative to flag mode toggle)

Add a prominent toggle button on mobile UI: `[🔍 Reveal] / [🚩 Flag]` — tap to switch mode.

### 4.3 Keyboard
- `F2` → new game
- `Space` on hovered cell → flag/unflag (desktop convenience)
- `Esc` → close any modal

### 4.4 Game state transitions
```
IDLE → (first click) → PLAYING → (hit mine) → LOST
                                → (all safe revealed) → WON
LOST / WON → (click smiley or F2) → IDLE
```

---

## 5. Logic Spec

### 5.1 Types

```ts
export type Difficulty = 'beginner' | 'intermediate' | 'expert' | 'custom';

export type CellState = 'hidden' | 'revealed' | 'flagged' | 'questioned';

export type Cell = {
  isMine: boolean;
  adjacentMines: number;    // 0–8
  state: CellState;
};

export type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

export type GameState = {
  board: Cell[][];
  rows: number;
  cols: number;
  mines: number;
  flagsPlaced: number;
  status: GameStatus;
  startedAt: number | null; // null until first click
  endedAt: number | null;
  firstClick: boolean;
  mineExploded: { row: number; col: number } | null;
  marksEnabled: boolean;
};

export type Difficulty_Config = { rows: number; cols: number; mines: number };
```

### 5.2 Core functions (pure, in `minesweeper.logic.ts`)

```ts
// Create an empty board (no mines yet — placed after first click)
createEmptyBoard(rows: number, cols: number): Cell[][]

// Place mines AVOIDING a safe zone around the first click
// safeZone = the first-clicked cell + its 8 neighbors (9 cells total)
placeMines(board: Cell[][], mines: number, safeRow: number, safeCol: number): Cell[][]

// Compute adjacentMines for every cell after mines are placed
computeAdjacency(board: Cell[][]): Cell[][]

// Reveal a cell. If 0 adjacent mines, flood-fill reveals neighbors.
// Returns new board + whether a mine was hit.
revealCell(board: Cell[][], row: number, col: number): { board: Cell[][]; hitMine: boolean }

// Toggle flag/question/none (cycles through states)
toggleFlag(board: Cell[][], row: number, col: number, marksEnabled: boolean): Cell[][]

// Chord: if flagged count around a revealed number equals the number, reveal non-flagged neighbors
chordReveal(board: Cell[][], row: number, col: number): { board: Cell[][]; hitMine: boolean }

// Win check: all non-mine cells are revealed
isWon(board: Cell[][]): boolean

// On loss: reveal all mines, mark incorrect flags
revealAllMines(board: Cell[][], exploded: {row,col}): Cell[][]
```

### 5.3 Flood-fill reveal (recursive or BFS)
When a cell with 0 adjacent mines is revealed, auto-reveal all 8 neighbors. If any neighbor also has 0 adjacent mines, continue flood-filling. Standard BFS/DFS; cap depth should not be needed on 30×24 max grid.

### 5.4 Chord click logic
Classic shortcut: on a revealed numbered cell, click BOTH mouse buttons at once (or middle-click). If the number of adjacent flags equals the cell's number, reveal all other non-flagged neighbors in one go. If any revealed neighbor is a mine, player loses.

Implement by detecting both buttons via `mousedown` event tracking (`event.buttons === 3`), or offer middle-click as alternative.

### 5.5 Timer
- Starts on first reveal (not on window open)
- Stops on win or loss
- Uses `requestAnimationFrame` or `setInterval(100ms)` — update display every 1s via math (don't tick every second to avoid drift)
- Max display: 999 seconds (classic cap)

---

## 6. Persistence (localStorage)

### 6.1 Keys
- `minesweeper:settings` → `{ difficulty, marksEnabled, custom: { rows, cols, mines } }`
- `minesweeper:stats` → `{ beginner: { gamesPlayed, wins, bestTime }, intermediate: {...}, expert: {...} }`

### 6.2 Best times
Track best completion time (fastest win) per difficulty. Classic Minesweeper also tracks winner's name (prompt on new best) — OPTIONAL stretch goal, can default to "Anonymous".

### 6.3 No mid-game resume
Minesweeper games are short. No need to persist current game state — closing the window resets. (Differs from Solitaire where resume matters.)

---

## 7. Mobile Responsiveness

Mobile Minesweeper is tricky due to small screens and no right-click.

### 7.1 Scaling
- Beginner (9×9): fits mobile easily at 32px cells
- Intermediate (16×16): mobile scales to ~22px cells, requires landscape or scroll
- Expert (30×16): mobile MUST scroll — add horizontal scroll container with `overflow-x: auto`, pinch-to-zoom

### 7.2 Mobile UI additions
- Flag mode toggle button (prominent, above the grid)
- Long-press to flag (fallback if toggle not used)
- Pinch-to-zoom on Expert boards

### 7.3 Hide chord on mobile
Chord click doesn't translate to touch. Skip it on mobile. OR implement as "tap revealed number twice quickly" — but this risks accidental triggers. **Recommendation**: just skip chord on mobile.

---

## 8. Edge Cases

- First click on win-size board (if custom is `rows=cols=3, mines=0`) → auto-wins immediately. Allow.
- Custom difficulty validation: `mines < (rows × cols) − 9` (must leave safe zone for first click). Show error in modal.
- Window resize mid-game → board recentres, state preserved.
- Minimizing + restoring the window → timer continues (classic behavior; doesn't pause).
- Opening Minesweeper window while already open → focus existing, don't duplicate.

---

## 9. Analytics (if PostHog is wired)

Reuse the existing `apps/web/lib/analytics.ts` wrapper. Fire:

- `game_opened` (props: `{ game: 'minesweeper' }`) — on window open
- `minesweeper_started` (props: `{ difficulty }`) — on first click
- `minesweeper_won` (props: `{ difficulty, time, bestTime: boolean }`)
- `minesweeper_lost` (props: `{ difficulty, timeElapsed, cellsRevealed }`)
- `minesweeper_difficulty_changed` (props: `{ from, to }`)

---

## 10. Future hooks (NOT in scope, but keep code open to)

The game component should expose a callback or event system that the parent app can later observe:

```ts
<Minesweeper
  onWin={(result) => {
    // result: { difficulty, time, movesMade, timestamp }
    // Parent app can later use this for whitelist/airdrop mechanic
  }}
/>
```

Don't implement any whitelist/signing/on-chain claim logic — that's a separate ticket. Just leave the callback hook.

---

## 11. Acceptance Criteria

Dev may ship when:

- [ ] All three preset difficulties (Beginner, Intermediate, Expert) playable end-to-end
- [ ] Custom difficulty modal works + validates input
- [ ] First-click safety guaranteed (first click + 8 neighbors never contain a mine)
- [ ] Flag + question mark cycle works
- [ ] Chord click works on desktop (both-buttons OR middle-click)
- [ ] Flood-fill reveal works on 0-adjacent cells
- [ ] Smiley face reflects state (default / anticipation / win / lose)
- [ ] Mine counter + timer counters display correct 7-segment LCD look
- [ ] Win detection correct (all non-mine cells revealed)
- [ ] Loss state shows all mines + marks incorrect flags
- [ ] Best times persist across sessions (per difficulty)
- [ ] Mobile: flag mode toggle works, long-press works, Expert scrolls
- [ ] Icon "SOON" badge removed from desktop + Start menu
- [ ] Placeholder "Coming Soon" window code removed
- [ ] No console errors in production build
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes
- [ ] Lighthouse mobile score for `/games/minesweeper` ≥ 85

---

## 12. Testing

Add to `apps/web/__tests__/`:

### 12.1 Unit tests (`minesweeper.logic.test.ts`)
- `createEmptyBoard` creates correct dimensions
- `placeMines` places exactly N mines, avoiding safe zone
- `computeAdjacency` counts correct neighbor mines
- `revealCell` on empty cell triggers flood-fill
- `revealCell` on mine returns `hitMine: true`
- `toggleFlag` cycles correctly (none → flag → ? → none when marksEnabled)
- `toggleFlag` cycles correctly (none → flag → none when !marksEnabled)
- `chordReveal` only triggers when flags match number
- `isWon` returns true only when all non-mines revealed
- Edge: 0 mines → auto-win on first click
- Edge: custom difficulty validation

### 12.2 Snapshot tests
- Fresh board renders correctly per difficulty
- Won state renders correctly (smiley, revealed board)
- Lost state renders correctly (exploded mine highlighted red)

---

## 13. Out of Scope

- Online leaderboard (future ticket, maybe tie to on-chain whitelist)
- Mine themes / skins beyond classic (future easter egg)
- Multiplayer Minesweeper (not planned)
- Replay / undo (classic Minesweeper has no undo)
- Sound effects (optional stretch — add if < 1h effort)
- Daily challenge mode (future)
- Pinball, FreeCell, Hearts (separate future tickets)

---

## 14. Dev Notes

- All game logic must stay **pure/stateless** in `minesweeper.logic.ts` (no DOM, no React) — same pattern as Solitaire
- Reuse the window chrome (`Window.tsx` or equivalent) built for Solitaire — don't rebuild
- Match CSS token system existing in hood.exe (Tahoma, XP buttons, XP input chrome)
- Keep bundle size lean: Minesweeper module should be < 20KB gzipped, lazy-loaded on first open
- Prefer SVG for 7-segment digits + smiley icons (crisp at any scale, trivial to color)
- Mine icon + flag icon: inline SVG, 16px, pixel-art style (looks sharp at 1x, bearable at 2x)
- Avoid heavy state libs — `useReducer` is enough for Minesweeper's state machine
- Timer tick: use `setInterval(100)` but calculate elapsed from `startedAt` on each render to avoid drift
- Chord click gotcha: on `mousedown`, track `event.buttons` globally. `buttons === 3` = both left+right pressed. Clear on `mouseup`.

---

## 15. Timeline

| Chunk | Task | Est |
|---|---|---|
| 1 | Scaffold components, remove placeholder, update window registry | 1h |
| 2 | Core logic (board gen, mine placement, flood-fill, flag cycle) + unit tests | 3h |
| 3 | UI (grid, cells, smiley, counters, menu bar) + XP styling | 3h |
| 4 | Chord click, keyboard shortcuts, timer, win/lose states | 2h |
| 5 | Difficulty modal, best-times persistence, mobile flag toggle | 2h |
| 6 | Mobile adaptation + Expert scroll + polish | 2h |
| 7 | Buffer: edge cases, test coverage, lint cleanup | 1h |

Total: **~14 hours (~2 working days)** including buffer.

---

## 16. Reference

- Classic Minesweeper gameplay: https://en.wikipedia.org/wiki/Microsoft_Minesweeper
- Rules + strategy: https://minesweeper.online
- Difficulty presets (classic Windows values): Beginner 9×9/10, Intermediate 16×16/40, Expert 30×16/99
- 7-segment display reference: https://en.wikipedia.org/wiki/Seven-segment_display
- First-click safety convention: https://www.minesweeper.info/wiki/First_Click
- Chord click explained: https://www.minesweeper.info/wiki/Chord

---

**End of brief.**

*Document version 1.0 — 2026-10-12 for hood.exe (Wealthy People)*
