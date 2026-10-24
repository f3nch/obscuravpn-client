// obscura-ui/src/common/locationLock.tsx
//
// Password prompt guarding VPN location changes. Reuses the DNS lock password
// (see dnsLock.ts): when a DNS lock is configured, connecting from the UI to
// anywhere other than a UK city or the UK itself requires that password.
// Verification happens in Rust via the bridge.

import { Button, Group, PasswordInput, Stack } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useState } from 'react';
import * as commands from '../bridge/commands';

export function confirmLocationPassword(): Promise<boolean> {
  return new Promise((resolve) => {
    const id = modals.open({
      title: 'Location is locked',
      onClose: () => resolve(false),
      children: <LocationLockPrompt onUnlocked={() => { resolve(true); modals.close(id); }} />,
    });
  });
}

function LocationLockPrompt({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tryUnlock = async () => {
    if (await commands.verifyDnsLockPassword(password)) {
      onUnlocked();
    } else {
      setError('Incorrect password');
    }
  };

  return (
    <Stack gap='xs'>
      <PasswordInput
        data-autofocus
        placeholder='Password'
        value={password}
        onChange={(e) => { setPassword(e.currentTarget.value); setError(null); }}
        error={error}
        autoComplete='current-password'
        onKeyDown={(e) => { if (e.key === 'Enter') void tryUnlock(); }}
      />
      <Group justify='flex-end'>
        <Button onClick={tryUnlock}>Unlock</Button>
      </Group>
    </Stack>
  );
}
