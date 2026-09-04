// obscura-ui/src/common/dnsLock.ts
//
// Local password lock for the DNS settings section of the Settings page.
//
// The password's salt + PBKDF2-SHA256 hash are stored natively (rustlib Config,
// persisted via config.json), not in browser storage. That file is machine-wide
// and owned by root:admin, so the lock survives across macOS accounts on the same
// machine and can't be bypassed by deleting a per-user WebKit data directory.
// Verification happens entirely in Rust — the plaintext password is sent over the
// bridge for a single command, but the stored hash is never sent to JS.
//
// No recovery by design: forgetting the password means the only way to remove
// the lock is via `disableDnsLock`, which itself requires the current password.
//
// Whether a lock exists (`isConfigured`) is native, persisted state, surfaced via
// `appStatus.dnsLockConfigured`. Whether it's currently unlocked in this session
// (`isLocked`) is ordinary ephemeral React state that resets on app restart.

import { useCallback, useEffect, useState } from 'react';
import * as commands from '../bridge/commands';

export interface DnsLockState {
  isConfigured: boolean;
  isLocked: boolean;
  setPassword: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  disableLock: (password: string) => Promise<boolean>;
}

export function useDnsLock(isConfigured: boolean): DnsLockState {
  const [isLocked, setIsLocked] = useState<boolean>(isConfigured);

  useEffect(() => {
    setIsLocked(isConfigured);
  }, [isConfigured]);

  const setPassword = useCallback(async (password: string) => {
    await commands.setDnsLockPassword(password);
    setIsLocked(true);
  }, []);

  const unlock = useCallback(
    async (password: string) => {
      if (!isConfigured) return true;
      const ok = await commands.verifyDnsLockPassword(password);
      if (ok) setIsLocked(false);
      return ok;
    },
    [isConfigured],
  );

  const lock = useCallback(() => {
    if (isConfigured) setIsLocked(true);
  }, [isConfigured]);

  const disableLock = useCallback(
    async (password: string) => {
      if (!isConfigured) return true;
      const ok = await commands.disableDnsLock(password);
      if (ok) setIsLocked(false);
      return ok;
    },
    [isConfigured],
  );

  return { isConfigured, isLocked, setPassword, unlock, lock, disableLock };
}
