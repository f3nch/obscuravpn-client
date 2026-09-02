import { Accordion, ActionIcon, Alert, Button, Card, Checkbox, Divider, Group, Modal, PasswordInput, Radio, Stack, Switch, Text, Title, useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import React, { ReactNode, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsCircleHalf } from 'react-icons/bs';
import { IoCheckmark, IoHelpCircleOutline, IoInformationCircleOutline, IoLockClosedOutline, IoMoon, IoSunnySharp } from 'react-icons/io5';
import { MdBlock, MdWarning } from 'react-icons/md';
import * as commands from '../bridge/commands';
import { PLATFORM, Platform } from '../bridge/SystemProvider';
import { DNS_OPTIONS_WEBPAGE } from '../common/accountUtils';
import { AppContext, DNSContentBlock, featureFlagEnabled, FeatureFlagKey, KnownFeatureFlagKey } from '../common/appContext';
import commonClasses from '../common/common.module.css';
import { useDnsLock } from '../common/dnsLock';
import { NotificationId } from '../common/notifIds';
import { useAsync } from '../common/useAsync';
import { normalizeError } from '../common/utils';
import { fmtErrorI18n, TranslationKey } from '../translations/i18n';
import classes from './Settings.module.css';

const APPLE_PLATFORMS = new Set([Platform.macOS, Platform.iOS]);
const IS_APPLE = APPLE_PLATFORMS.has(PLATFORM);
const IS_ANDROID = PLATFORM === Platform.Android;
const IS_LINUX = PLATFORM === Platform.Linux;
const IS_WINDOWS = PLATFORM === Platform.Windows;

export default function Settings() {
  return (
    <Stack mb='xl' gap='lg' align='flex-start' className={classes.container}>
      <GeneralSettings />
      <DnsSettings />
      <ExperimentalSettings />
      <NetworkSettings />
      <AppearanceSettings />
    </Stack>
  );
}

function DnsSettings() {
  const { t } = useTranslation();
  const { appStatus, osStatus } = useContext(AppContext);
  const { dnsContentBlock, useSystemDns } = appStatus;
  /* no "Use system DNS" on Android (see applyNetworkConfig in ObscuraVpnService.kt) */
  const SUPPORTS_DNS_SELECTION = !IS_ANDROID && !IS_WINDOWS;

  const dnsLock = useDnsLock();
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const isLockedNow = dnsLock.isConfigured && dnsLock.isLocked;

  const onBlockChange = (key: keyof DNSContentBlock, e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.currentTarget.checked;
    const newBlock = { ...dnsContentBlock, [key]: checked };
    commands.setDnsContentBlock(newBlock);
  };

  const checkboxes = (
    <>
      <Checkbox disabled={useSystemDns} checked={dnsContentBlock.ad} onChange={(e) => onBlockChange('ad', e)} label={t('dnsBlockAds')} />
      <Checkbox disabled={useSystemDns} checked={dnsContentBlock.tracker} onChange={(e) => onBlockChange('tracker', e)} label={t('dnsBlockTrackers')} />
      <Checkbox disabled={useSystemDns} checked={dnsContentBlock.malware} onChange={(e) => onBlockChange('malware', e)} label={t('dnsBlockMalware')} />
      <Checkbox disabled={useSystemDns} checked={dnsContentBlock.gambling} onChange={(e) => onBlockChange('gambling', e)} label={t('dnsBlockGambling')} />
      <Checkbox disabled={useSystemDns} checked={dnsContentBlock.adult} onChange={(e) => onBlockChange('adult', e)} label={t('dnsBlockAdult')} />
      <Checkbox disabled={useSystemDns} checked={dnsContentBlock.socialMedia} onChange={(e) => onBlockChange('socialMedia', e)} label={t('dnsBlockSocialMedia')} />
    </>
  );

  return (
    <Card padding='md' radius='md' w='100%' shadow='xs'>
      <Stack gap='xs'>
        <Group gap='xs'>
          <MdBlock size='1.5em' style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Title order={4}>{t('dnsSetting')}</Title>
          <ActionIcon component='a' href={DNS_OPTIONS_WEBPAGE} target='_blank' variant='subtle' color='gray' ml='auto' aria-label={t('dnsSettingHelp')}>
            <IoHelpCircleOutline size='1.5em' />
          </ActionIcon>
        </Group>

        {isLockedNow ? (
          <DnsLockPrompt onUnlock={dnsLock.unlock} />
        ) : (
          <>
            {SUPPORTS_DNS_SELECTION ? (
              <Radio.Group value={useSystemDns ? 'system' : 'obscura'} onChange={(val) => commands.setUseSystemDns(val === 'system')}>
                <Stack gap='sm'>
                  <Radio value="obscura" label={t('dnsModeObscura')} />
                  <Stack gap='xs' ml='xl'>{checkboxes}</Stack>
                  <Radio
                    value="system"
                    label={t(IS_LINUX ? 'dnsModeSystemLinux' : 'dnsModeSystemApple')}
                    description={t('dnsModeSystemDescription')}
                  />
                </Stack>
              </Radio.Group>
            ) : (
              <Stack gap='xs'>{checkboxes}</Stack>
            )}
          </>
        )}

        {IS_ANDROID && osStatus.privateDnsActive && (
          <Alert icon={<MdWarning />} color='orange' variant='light'>
            {t('androidPrivateDnsAlert')}
          </Alert>
        )}

        <Divider w='100%' />

        <Group justify='space-between' wrap='nowrap'>
          <div>
            <Text size='sm' fw={500}>Password protect DNS settings</Text>
            <Text size='xs' c='dimmed'>Require a password to change DNS settings on this device.</Text>
          </div>
          <Switch
            checked={dnsLock.isConfigured}
            disabled={isLockedNow}
            onChange={(e) => {
              if (e.currentTarget.checked) setSetupModalOpen(true);
              else setDisableModalOpen(true);
            }}
          />
        </Group>

        {dnsLock.isConfigured && !isLockedNow && (
          <Group gap='xs'>
            <Button variant='subtle' size='xs' leftSection={<IoLockClosedOutline />} onClick={dnsLock.lock}>
              Lock now
            </Button>
            <Button variant='subtle' size='xs' onClick={() => setSetupModalOpen(true)}>
              Change password
            </Button>
          </Group>
        )}
      </Stack>

      <DnsLockSetupModal
        opened={setupModalOpen}
        isChangingExisting={dnsLock.isConfigured}
        onClose={() => setSetupModalOpen(false)}
        onSubmit={async (password) => {
          await dnsLock.setPassword(password);
          setSetupModalOpen(false);
        }}
      />
      <DnsLockDisableModal
        opened={disableModalOpen}
        onClose={() => setDisableModalOpen(false)}
        onSubmit={dnsLock.disableLock}
        onSuccess={() => setDisableModalOpen(false)}
      />
    </Card>
  );
}

function DnsLockPrompt({ onUnlock }: { onUnlock: (password: string) => Promise<boolean> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tryUnlock = async () => {
    const ok = await onUnlock(password);
    if (ok) {
      setPassword('');
      setError(null);
    } else {
      setError('Incorrect password');
    }
  };

  return (
    <Stack gap='xs' align='flex-start' w='100%'>
      <Group gap='xs'>
        <IoLockClosedOutline size='1.25em' />
        <Text size='sm'>DNS settings are locked.</Text>
      </Group>
      <Group gap='xs' w='100%' wrap='nowrap'>
        <PasswordInput
          placeholder='Password'
          value={password}
          onChange={(e) => { setPassword(e.currentTarget.value); setError(null); }}
          error={error}
          onKeyDown={(e) => { if (e.key === 'Enter') tryUnlock(); }}
          style={{ flexGrow: 1 }}
        />
        <Button onClick={tryUnlock}>Unlock</Button>
      </Group>
    </Stack>
  );
}

function DnsLockSetupModal({ opened, isChangingExisting, onClose, onSubmit }: {
  opened: boolean;
  isChangingExisting: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && password !== confirm;

  const reset = () => { setPassword(''); setConfirm(''); };

  return (
    <Modal opened={opened} onClose={() => { reset(); onClose(); }} title={isChangingExisting ? 'Change DNS lock password' : 'Set DNS lock password'}>
      <Stack>
        {!isChangingExisting && (
          <Alert color='yellow' variant='light'>
            There's no password recovery for this. If it's forgotten, the DNS lock can only be removed by resetting the app's local data.
          </Alert>
        )}
        <PasswordInput label='Password' value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoFocus />
        <PasswordInput
          label='Confirm password'
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          error={mismatch ? "Passwords don't match" : undefined}
        />
        <Group justify='flex-end'>
          <Button variant='default' onClick={onClose}>Cancel</Button>
          <Button
            disabled={password.length < 8 || mismatch}
            onClick={async () => { await onSubmit(password); reset(); }}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function DnsLockDisableModal({ opened, onClose, onSubmit, onSuccess }: {
  opened: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<boolean>;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      opened={opened}
      onClose={() => { setPassword(''); setError(null); onClose(); }}
      title="Turn off DNS lock"
    >
      <Stack>
        <Text size='sm'>Enter the current password to turn off DNS protection.</Text>
        <PasswordInput
          value={password}
          onChange={(e) => { setPassword(e.currentTarget.value); setError(null); }}
          error={error}
          autoFocus
        />
        <Group justify='flex-end'>
          <Button variant='default' onClick={onClose}>Cancel</Button>
          <Button
            color='red'
            onClick={async () => {
              const ok = await onSubmit(password);
              if (ok) { setPassword(''); onSuccess(); }
              else setError('Incorrect password');
            }}
          >
            Turn off
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function GeneralSettings() {
  const { t } = useTranslation();
  const { appStatus, osStatus } = useContext(AppContext);
  const loginItemStatus = osStatus.loginItemStatus;
  const loginItemRegistered = loginItemStatus?.registered;
  const loginItemError = loginItemStatus?.error;

  const { error: refreshLoginItemError } = useAsync({
    load: commands.refreshLoginItemStatus,
    returnError: true,
  });

  useEffect(() => {
    if (refreshLoginItemError) {
      console.error("Failed to refresh login item status", refreshLoginItemError);
    }
  }, [refreshLoginItemError]);

  const registerAtLogin = async () => {
    let success = true;
    try {
      await commands.registerAsLoginItem();
    } catch {
      success = false;
    }
    notifications.hide(NotificationId.OPEN_AT_LOGIN);
    notifications.show({
      id: NotificationId.OPEN_AT_LOGIN,
      title: success ? t('Success') : t('Failed'),
      message: success ? t('openAtLoginEnabled') : t('openAtLoginFailedToEnable'),
      loading: false,
      color: success ? 'green' : 'red'
    });
  }

  const unregisterAtLogin = async () => {
    let success = true;
    try {
      await commands.unregisterAsLoginItem();
    } catch {
      success = false;
    }
    notifications.hide(NotificationId.OPEN_AT_LOGIN);
    notifications.show({
      id: NotificationId.OPEN_AT_LOGIN,
      title: success ? t('Success') : t('Failed'),
      message: success ? t('openAtLoginDisabled') : t('openAtLoginFailedToDisable'),
      loading: false,
      color: success ? 'green' : 'red'
    });
  }

  return (
    <Card padding='md' radius='md' w='100%' shadow='xs'>
      <Stack gap='xs'>
        <Title order={4}>{t('General')}</Title>
        {
          loginItemStatus &&
          <Switch error={loginItemError === undefined ? undefined : loginItemError} disabled={loginItemError !== undefined || loginItemRegistered === undefined} checked={loginItemRegistered} onChange={event => event.currentTarget.checked ? registerAtLogin() : unregisterAtLogin()} label={t('openAtLoginRegister')} />
        }
        <Divider w='100%' />
        <Stack gap={2} w='100%'>
          <Switch checked={appStatus.autoConnect} onChange={event => commands.setAutoConnect(event.currentTarget.checked)} label={t('autoConnectStartup')} description={t('autoConnectStartup-behavior')} />
        </Stack>
      </Stack>
    </Card>
  );
}

function NetworkSettings() {
  const { t } = useTranslation();
  const [wgRotated, setWgRotated] = useState(false);
  const [wgRotatedTimeout, setWGRotateTimeout] = useState<number | null>(null);

  const rotateWgKey = async () => {
    try {
      await commands.rotateWgKey();
      window.clearTimeout(wgRotatedTimeout!);
      setWgRotated(true);
      setWGRotateTimeout(window.setTimeout(() => setWgRotated(false), 2000));
    } catch (e) {
      const error = normalizeError(e);
      const message = error instanceof commands.CommandError
        ? fmtErrorI18n(t, error) : error.message;
      notifications.show({
        title: t('Error'),
        message: message,
        color: 'red',
      });
    }
  }

  return (
    <Card padding='md' radius='md' w='100%' shadow='xs'>
      <Stack gap='xs' align='flex-start'>
        <Title order={4}>{t('Network')}</Title>
        <Button onClick={rotateWgKey} bg={wgRotated ? 'teal' : undefined} rightSection={wgRotated ? <IoCheckmark /> : undefined} miw={200}>
          {wgRotated ? t('Rotated') : t('rotateWgKey')}
        </Button>
        {(IS_ANDROID || IS_LINUX) && (
          <>
            <Divider w='100%' />
            <LocalNetworkAccessSwitch />
          </>
        )}
      </Stack>
    </Card>
  );
}

const AVAILABLE_FLAGS: Record<FeatureFlagKey, boolean> = {
  [KnownFeatureFlagKey.KillSwitch]: IS_APPLE,
};

function ExperimentalSettings() {
  const { t } = useTranslation();
  const { appStatus } = useContext(AppContext);

  const components = appStatus.featureFlagKeys
    .filter(key => AVAILABLE_FLAGS[key] ?? true)
    .map(key => <FeatureFlagToggle featureFlagKey={key} />);
  if (IS_APPLE) {
    components.push(<StrictLeakPreventionSwitch />);
  }

  return (
    <Accordion variant='separated' w='100%' classNames={{ item: `${commonClasses.elevatedSurface} ${classes.experimentalAccordionControl}` }}>
      <Accordion.Item value='experimental'>
        <Accordion.Control>
          <Title order={4}>{t('Experimental')}</Title>
        </Accordion.Control>
        <Accordion.Panel style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Stack gap='lg' align='flex-start' my='xs'>
            {components.map((component, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Divider w='100%' />}
                {component}
              </React.Fragment>
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function AppearanceSettings() {
  const { t } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const resetMantineColorScheme = () => setColorScheme('auto');

  return (
    <Card padding='md' radius='md' w='100%' shadow='xs' pb='lg'>
      <Stack gap='lg'>
        <Title order={4}>{t('Appearance')}</Title>
        <Group gap='0' maw='25em' justify='space-around'>
          {colorSchemeOptions.map(({ colorScheme, i18nKey, icon }) => (
            <ActionIcon
              key={colorScheme}
              variant='default'
              onClick={async () => {
                resetMantineColorScheme();
                try {
                  await commands.setColorScheme(colorScheme);
                } catch (e) {
                  console.error('Failed to set theme:', e);
                }
              }}
              h={80}
              w={100}
            >
              <Stack align='center' gap='xs'>
                {icon}
                <Text size='sm'>{t(i18nKey)}</Text>
              </Stack>
            </ActionIcon>
          ))}
        </Group>
      </Stack>
    </Card>
  );
}


function StrictLeakPreventionSwitch() {
  const { t } = useTranslation();
  const { vpnConnected, osStatus } = useContext(AppContext);
  const { strictLeakPrevention } = osStatus;
  const { showLoadingUI, error, execute: setStrictLeakPrevention } = commands.useCommand({ command: commands.setStrictLeakPrevention});

  const disabled = strictLeakPrevention && vpnConnected;

  return (
    <Stack gap='xs' w='100%'>
      <Switch
        error={error}
        checked={strictLeakPrevention}
        onChange={(event) => setStrictLeakPrevention(event.currentTarget.checked)}
        disabled={disabled || showLoadingUI}
        label={t('strictLeakPreventionLabel')}
        description={t('strictLeakPreventionDescription')}
      />
      {disabled &&
        <Alert icon={<IoInformationCircleOutline />} color='blue' variant='light'>
          {t('strictLeakPreventionTooltip')}
        </Alert>
      }
      <Alert icon={<MdWarning />} color='orange' variant='light'>
        {t('strictLeakPreventionLanWarning')}
      </Alert>
      <Alert icon={<MdWarning />} color='red' variant='light'>
        {t('strictLeakPreventionReliabilityWarning')}
      </Alert>
    </Stack>
  );
}

function LocalNetworkAccessSwitch() {
  const { t } = useTranslation();
  const { appStatus } = useContext(AppContext);
  const { localNetworkAccess } = appStatus;
  const { showLoadingUI, error, execute: setLocalNetworkAccess } = commands.useCommand({ command: commands.setLocalNetworkAccess });

  return (
    <Switch
      w='100%'
      error={error}
      checked={localNetworkAccess}
      onChange={(event) => setLocalNetworkAccess(event.currentTarget.checked)}
      disabled={showLoadingUI}
      label={t('localNetworkAccessLabel')}
    />
  );
}

function FeatureFlagToggle({ featureFlagKey }: { featureFlagKey: FeatureFlagKey }) {
  const { t, i18n } = useTranslation();
  const { appStatus } = useContext(AppContext);
  const { showLoadingUI, error, execute: setFeatureFlag } = commands.useCommand({ command: commands.setFeatureFlag });

  const onChange = (checked: boolean) => setFeatureFlag(featureFlagKey, checked);

  const labelKey = `featureFlag-${featureFlagKey}-Label`;
  const descriptionKey = `featureFlag-${featureFlagKey}-Description`;

  const label = i18n.exists(labelKey) ? t(labelKey as TranslationKey) : featureFlagKey;
  const description = i18n.exists(descriptionKey) ? t(descriptionKey as TranslationKey) : undefined;

  const additionalComponents = FEATURE_FLAG_CUSTOM_UI[featureFlagKey]?.(t);

  return (
    <Stack gap='xs' w='100%'>
      <Switch
        error={error}
        checked={featureFlagEnabled(appStatus.featureFlags[featureFlagKey])}
        onChange={(event) => onChange(event.currentTarget.checked)}
        disabled={showLoadingUI}
        label={label}
        description={description}
      />
      {additionalComponents}
    </Stack>
  );
}

const FEATURE_FLAG_CUSTOM_UI: Partial<Record<FeatureFlagKey, (t: ReturnType<typeof useTranslation>['t']) => ReactNode>> = {
  [KnownFeatureFlagKey.QuicFramePadding]: (t) => (
    <Alert icon={<MdWarning />} color='orange' variant='light'>
      {t('featureFlag-quicFramePadding-BandwidthWarning')}
    </Alert>
  ),
  [KnownFeatureFlagKey.ForceSmallMtu]: (t) => (
    <Alert icon={<MdWarning />} color='orange' variant='light'>
      {t('featureFlag-forceSmallMtu-Warning')}
    </Alert>
  ),
  [KnownFeatureFlagKey.TcpTlsTunnel]: (t) => (
    <Alert icon={<MdWarning />} color='orange' variant='light'>
      {t('featureFlag-tcpTlsTunnel-BandwidthWarning')}
    </Alert>
  ),
};

const colorSchemeOptions = [
  { colorScheme: 'light', i18nKey: 'Light', icon: <IoSunnySharp size='1.5em' /> },
  { colorScheme: 'dark', i18nKey: 'Dark', icon: <IoMoon size='1.25em' /> },
  { colorScheme: 'auto', i18nKey: 'System', icon: <BsCircleHalf style={{ transform: 'rotate(180deg)' }} size='1.25em' /> }
] as const;
