import type { ComponentType } from 'react';
import {
  CalloutsIcon,
  ExploreIcon,
  GamesFolderIcon,
  HelpIcon,
  InfoIcon,
  LaunchIcon,
  PortfolioIcon,
  LockIcon,
  MinesweeperIcon,
  RecycleBinIcon,
  SolitaireIcon,
  TheoremIcon,
  WarningIcon,
  type IconProps,
} from '@/components/xp/Icons';

export type AppId = 'welcome' | 'launch' | 'explore' | 'callouts' | 'portfolio' | 'theorem' | 'about' | 'recycle' | 'token' | 'terms' | 'risk' | 'privacy' | 'games' | 'solitaire' | 'minesweeper';

export type AppMeta = {
  id: AppId;
  /** Window title. */
  title: string;
  /** Label under the desktop icon. */
  label: string;
  /** One-liner for the Start menu. */
  description: string;
  Icon: ComponentType<IconProps>;
  w: number;
  h: number;
  maximizable?: boolean;
};

export const APPS: Record<AppId, AppMeta> = {
  welcome: {
    id: 'welcome',
    title: 'Welcome to hood.exe',
    label: 'Start Here',
    description: 'Tour of the desktop',
    Icon: HelpIcon,
    w: 580,
    h: 460,
  },
  launch: {
    id: 'launch',
    title: 'Launch.exe — New Token Wizard',
    label: 'Launch.exe',
    description: 'Launch a coin on Pons',
    Icon: LaunchIcon,
    w: 500,
    h: 580,
    maximizable: false,
  },
  explore: {
    id: 'explore',
    title: 'Explore.exe',
    label: 'Explore.exe',
    description: 'Browse coins by rigor and market cap',
    Icon: ExploreIcon,
    w: 580,
    h: 440,
  },
  callouts: {
    id: 'callouts',
    title: 'Callouts.exe — Live',
    label: 'Callouts.exe',
    description: 'Live market calls from holders',
    Icon: CalloutsIcon,
    w: 560,
    h: 500,
  },
  portfolio: {
    id: 'portfolio',
    title: 'Portfolio',
    label: 'Portfolio',
    description: 'Your launches and holdings',
    Icon: PortfolioIcon,
    w: 540,
    h: 360,
  },
  theorem: {
    id: 'theorem',
    title: 'Theorem Board.dlg',
    label: 'Theorem Board',
    description: 'How theorem launches work',
    Icon: TheoremIcon,
    w: 440,
    h: 340,
    maximizable: false,
  },
  about: {
    id: 'about',
    title: 'About hood.exe',
    label: 'About',
    description: 'Version and system info',
    Icon: InfoIcon,
    w: 400,
    h: 400,
    maximizable: false,
  },
  token: {
    id: 'token',
    title: 'Token Detail',
    label: 'Token',
    description: 'One coin: curve, theorem, links',
    Icon: TheoremIcon,
    w: 720,
    h: 540,
  },
  terms: {
    id: 'terms',
    title: 'Terms of Use',
    label: 'Terms of Use',
    description: 'The rules for using hood.exe',
    Icon: InfoIcon,
    w: 500,
    h: 460,
  },
  risk: {
    id: 'risk',
    title: 'Risk disclosure',
    label: 'Risk disclosure',
    description: 'What can go wrong',
    Icon: WarningIcon,
    w: 500,
    h: 460,
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy notice',
    label: 'Privacy notice',
    description: 'What hood.exe stores about you',
    Icon: LockIcon,
    w: 500,
    h: 460,
  },
  games: {
    id: 'games',
    title: 'Games',
    label: 'Games',
    description: 'Solitaire and Minesweeper',
    Icon: GamesFolderIcon,
    w: 360,
    h: 240,
  },
  solitaire: {
    id: 'solitaire',
    title: 'Solitaire',
    label: 'Solitaire',
    description: 'Klondike, turn one',
    Icon: SolitaireIcon,
    w: 600,
    h: 500,
  },
  minesweeper: {
    id: 'minesweeper',
    title: 'Minesweeper',
    label: 'Minesweeper',
    description: 'Beginner, Intermediate, Expert',
    Icon: MinesweeperIcon,
    // Opening size; the window then fits itself to the board for each difficulty.
    w: 350,
    h: 420,
    maximizable: false,
  },
  recycle: {
    id: 'recycle',
    title: 'Recycle Bin',
    label: 'Recycle Bin',
    description: 'Deleted items',
    Icon: RecycleBinIcon,
    w: 460,
    h: 300,
  },
};

/** Desktop icon order (docs/BRIEF.md §4.1). */
export const DESKTOP_APPS: AppId[] = ['welcome', 'launch', 'explore', 'callouts', 'portfolio', 'theorem', 'games', 'about', 'recycle'];

/** The Games folder and the Start menu's Games submenu (hood-exe-games-brief.md §1.3–1.4). */
export const GAME_APPS: AppId[] = ['solitaire', 'minesweeper'];

/** Start menu list order. */
export const START_APPS: AppId[] = ['launch', 'explore', 'callouts', 'portfolio', 'theorem'];

export const isAppId = (v: string | null | undefined): v is AppId => !!v && v in APPS;
