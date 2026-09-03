// obscura-ui/src/common/dnsLock.ts
//
// Local password lock for the DNS settings section of the Settings page.
// This is a device-local UI gate only — it does not go through the Rust/native
// bridge (bridge/commands.ts) at all, since it's not an actual DNS/VPN setting,
// just a local restriction on who can use the DNS settings UI on this device.
//
// ASSUMPTION TO VERIFY: this uses window.localStorage, assuming the web bundle's
// storage persists across app restarts inside the native webview. If you find
// obscura-ui has its own persistence bridge for local UI state, swap
// loadSecret/saveSecret/clearSecret below to use that instead.
//
// No recovery by design: forgetting the password means the only way to remove
// the lock is clearing this storage (effectively an app/data reset), matching
// the "no recovery" decision made for this feature.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'obscura.dnsLock.secret';
const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 baseline for PBKDF2-SHA256
const HASH_BITS = 256;

export interface StoredDnsLockSecret {
  saltB64: string;
  hashB64: string;
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveHash(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS,
  );
}

async function hashPassword(password: string): Promise<StoredDnsLockSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt);
  return { saltB64: toBase64(salt.buffer), hashB64: toBase64(hash) };
}

async function verifyPassword(password: string, stored: StoredDnsLockSecret): Promise<boolean> {
  const salt = fromBase64(stored.saltB64);
  const attempt = new Uint8Array(await deriveHash(password, salt));
  const expected = fromBase64(stored.hashB64);
  if (attempt.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < attempt.length; i++) diff |= attempt[i]! ^ expected[i]!;
  return diff === 0;
}

function loadSecret(): StoredDnsLockSecret | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDnsLockSecret;
  } catch {
    return null;
  }
}

function saveSecret(secret: StoredDnsLockSecret) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(secret));
}

function clearSecret() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export interface DnsLockState {
  isConfigured: boolean;
  isLocked: boolean;
  setPassword: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  disableLock: (password: string) => Promise<boolean>;
}

export function useDnsLock(): DnsLockState {
  const [secret, setSecret] = useState<StoredDnsLockSecret | null>(() => loadSecret());
  const [isLocked, setIsLocked] = useState<boolean>(() => loadSecret() !== null);

  useEffect(() => {
    setIsLocked(secret !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret === null]);

  const setPassword = useCallback(async (password: string) => {
    const newSecret = await hashPassword(password);
    saveSecret(newSecret);
    setSecret(newSecret);
    setIsLocked(true);
  }, []);

  const unlock = useCallback(
    async (password: string) => {
      if (!secret) return true;
      const ok = await verifyPassword(password, secret);
      if (ok) setIsLocked(false);
      return ok;
    },
    [secret],
  );

  const lock = useCallback(() => {
    if (secret) setIsLocked(true);
  }, [secret]);

  const disableLock = useCallback(
    async (password: string) => {
      if (!secret) return true;
      const ok = await verifyPassword(password, secret);
      if (!ok) return false;
      clearSecret();
      setSecret(null);
      setIsLocked(false);
      return true;
    },
    [secret],
  );

  return { isConfigured: secret !== null, isLocked, setPassword, unlock, lock, disableLock };
}