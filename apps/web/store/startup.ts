import { create } from 'zustand';

/** Whether the first load's boot and welcome screens are gone (components/Startup.tsx), so the desktop is in view. */
export const useStartup = create<{ done: boolean }>(() => ({ done: false }));
