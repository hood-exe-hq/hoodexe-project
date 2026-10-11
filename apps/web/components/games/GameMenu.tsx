'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './GameMenu.module.css';

type MenuCtx = { open: string | null; setOpen: (label: string | null) => void };
const Ctx = createContext<MenuCtx>({ open: null, setOpen: () => {} });

/** An XP window menu bar (Game, Help…) shared by the games. Menus close on any click outside them. */
export function MenuBar({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <Ctx.Provider value={{ open, setOpen }}>
      <div className={styles.menubar} ref={ref} role="menubar">
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function MenuButton({ label, children }: { label: string; children: ReactNode }) {
  const { open, setOpen } = useContext(Ctx);
  const isOpen = open === label;
  return (
    <div className={styles.menuRoot}>
      <button
        type="button"
        className={`${styles.menuTitle} ${isOpen ? styles.menuOpen : ''}`}
        onClick={() => setOpen(isOpen ? null : label)}
        onPointerEnter={() => open && setOpen(label)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {label}
      </button>
      {isOpen && (
        <div className={styles.menuList} role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

/** Closes the menu, then runs `onClick`. `checked` makes it a checkable item (✓). */
export function MenuItem({ children, onClick, shortcut, checked, disabled }: { children: ReactNode; onClick: () => void; shortcut?: string; checked?: boolean; disabled?: boolean }) {
  const { setOpen } = useContext(Ctx);
  return (
    <button
      type="button"
      role={checked == null ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      className={styles.menuItem}
      onClick={() => {
        setOpen(null);
        onClick();
      }}
      disabled={disabled}
    >
      <span className={styles.check}>{checked ? '✓' : ''}</span>
      <span>{children}</span>
      {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
    </button>
  );
}
