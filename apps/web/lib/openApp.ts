import { APPS, type AppId } from '@/components/apps/meta';
import { useWindows } from '@/store/windows';

export function openApp(appId: AppId) {
  const { title, w, h } = APPS[appId];
  return useWindows.getState().open({ appId, title, w, h });
}

/** Verification Queue.exe; with a token, straight to submitting a proof for that coin (from Token Detail). */
export function openVerification(token?: string) {
  const { title, w, h } = APPS.verification;
  return useWindows.getState().open({ appId: 'verification', title, w, h, props: token ? { token, at: String(Date.now()) } : undefined });
}

/** Token Detail, one window per token. */
export function openToken(address: string, symbol?: string) {
  const { w, h } = APPS.token;
  return useWindows.getState().open({
    appId: 'token',
    key: `token:${address.toLowerCase()}`,
    title: symbol ? `$${symbol} — Token Detail` : 'Token Detail',
    w,
    h,
    props: { address },
  });
}
