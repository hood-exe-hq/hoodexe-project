import type { Metadata } from 'next';
import { Startup } from '@/components/Startup';

export const metadata: Metadata = {
  title: 'Minesweeper | hood.exe',
  description: 'Classic Minesweeper on the hood.exe desktop: Beginner, Intermediate, Expert and Custom. No wallet needed.',
};

/** /games/minesweeper: the desktop boots and opens Minesweeper (the desktop reads the path). */
export default function MinesweeperPage() {
  return <Startup />;
}
