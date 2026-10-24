import { Accordion, ActionIcon, Anchor, Button, Card, Divider, Flex, Grid, Group, Loader, Space, Stack, Text, ThemeIcon, Title, useMantineTheme } from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { t } from 'i18next';
import { MouseEvent, useContext, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { BsPin, BsPinFill, BsShieldFillCheck, BsShieldFillExclamation } from 'react-icons/bs';
import * as commands from '../bridge/commands';
import { CONNECT_REQUIRES_ONLINE, IS_HANDHELD_DEVICE } from '../bridge/SystemProvider';
import { accountIsExpired, Exit, getExitCountry } from '../common/api';
import { AppContext, ConnectionInProgress, getCityFromArgs, getCityFromStatus, NEVPNStatus } from '../common/appContext';
import commonClasses from '../common/common.module.css';
import { exitCityEquals, exitLocation, exitsSortComparator, isAllowedLocation } from '../common/exitUtils';
import { KeyedSet } from '../common/KeyedSet';
import { NotificationId } from '../common/notifIds';
import { useAsync } from '../common/useAsync';
import { useExitList } from '../common/useExitList';
import { fmtTime } from '../common/utils';
import { MobileDrawer } from '../components/ConfirmationDialog';
import { Flag } from '../components/CountryFlag';
import ExternalLinkIcon from '../components/ExternalLinkIcon';
import ObscuraChip from '../components/ObscuraChip';
import { SecondaryButton } from '../components/SecondaryButton';
import CheckMarkCircleFill from '../res/checkmark.circle.fill.svg?react';
import Eye from '../res/eye.fill.svg?react';
import EyeSlash from '../res/eye.slash.fill.svg?react';
import OrangeCheckedShield from '../res/orange-checked-shield.svg?react';
import { fmtErrorI18n } from '../translations/i18n';
import classes from './Location.module.css';

export default function LocationView() {
    const { t } = useTranslation();
    const { vpnConnected, vpnConnect, connectionInProgress, appStatus } = useContext(AppContext);

    const { exitList } = useExitList({
      periodS: 60,
    });

    const onExitSelect = async (exit: Exit) => {
        // connected already to the desired exit
        const connectedExit = appStatus.vpnStatus.connected?.exit;
        if (
          exit.country_code === connectedExit?.country_code
          && exit.city_name === connectedExit.city_name
        ) {
            return;
        }
        if (vpnConnected || connectionInProgress !== ConnectionInProgress.UNSET) {
            notifications.hide(NotificationId.VPN_DISCONNECT_CONNECT);
            notifications.show({
                title: t('connectingToCity', { city: exit.city_name }),
                message: '',
                autoClose: 15_000,
                color: 'yellow.4',
                id: NotificationId.VPN_DISCONNECT_CONNECT
            });
        }
        await vpnConnect({
          city: {
            city_code: exit.city_code,
            country_code: exit.country_code,
          }
        });
    };

    const toggleExitPin = (exit: Exit) => {
      if (!exitList) {
        console.error("Toggling pin with no exit list")
        return;
      }

      let removed = appStatus.pinnedLocations.filter(loc =>
        !(loc.city_code == exit.city_code
        && loc.country_code == loc.country_code)
      );
      if (removed.length !== appStatus.pinnedLocations.length) {
        commands.setPinnedExits(removed);
      } else {
        commands.setPinnedExits([
          ...appStatus.pinnedLocations,
          {
            country_code: exit.country_code,
            city_code: exit.city_code,
            pinned_at: Math.floor(Date.now()/1000),
          },
        ]);
      }
    };

    const connectedExit = appStatus.vpnStatus.connected?.exit;
    const pinnedLocationSet = new KeyedSet(
      (loc: {country_code: string, city_code: string}) => JSON.stringify([loc.country_code, loc.city_code]),
      appStatus.pinnedLocations,
    );

    // Only United Kingdom exits are offered.
    const ukLocations = (exitList ?? [])
      .filter(isAllowedLocation)
      .sort(exitsSortComparator);

    return (
        <Stack align='center' gap={10} className={classes.container}>
            <VpnStatusCard />
            {ukLocations.length === 0 ? <NoExitServers /> :
                <>
                  <Title order={3} ta='left' fw={600} w='100%'>
                    {t('Location')}
                  </Title>
                  <Divider my='xs' w='100%' />
                  {ukLocations.map(exit => (
                    <LocationCard key={JSON.stringify([exit.country_code, exit.city_name])} exit={exit} togglePin={toggleExitPin}
                        onSelect={() => onExitSelect(exit)} connected={exitCityEquals(exit, connectedExit)}
                        pinned={pinnedLocationSet.has(exitLocation(exit))} />
                  ))}
                </>}
        </Stack>
    );
}

interface LocationCarProps {
  exit: Exit,
  connected: boolean,
  showLastChosen?: boolean,
  onSelect: () => void,
  togglePin: (exit: Exit) => void,
  pinned: boolean
}

function LocationCard({ exit, connected, showLastChosen = false, onSelect, togglePin, pinned }: LocationCarProps) {
    const { t } = useTranslation();
    const { osStatus, showOfflineUI, appStatus, initiatingExitSelector, accountInfo } = useContext(AppContext);

    const onPinClick = (e: MouseEvent) => {
        e.stopPropagation();
        togglePin(exit);
    };

    const isAccountExpired = accountInfo ? accountIsExpired(accountInfo) : false;
    const disableClick = osStatus.osVpnStatus === NEVPNStatus.Disconnecting || (showOfflineUI && CONNECT_REQUIRES_ONLINE) || isAccountExpired;
    const cardClasses = [];
    if (connected) cardClasses.push(classes.locationCardConnected);
    else if (!connected && osStatus.osVpnStatus !== NEVPNStatus.Disconnecting && (exitCityEquals(getCityFromStatus(appStatus.vpnStatus), exit) || exitCityEquals(getCityFromArgs(initiatingExitSelector), exit))) {
      cardClasses.push(classes.connectingAnimation);
    }
    else if (disableClick) cardClasses.push(classes.locationCardDisabled);
    else if (!connected) cardClasses.push(classes.locationCardNotConnected);
    const cardTitle = (!connected && !disableClick) ? t('clickToConnect') : (isAccountExpired ? t('account-Expired') : undefined);

    return (
        <Card shadow='xs' title={cardTitle} className={cardClasses.join(' ')} withBorder padding='xs' radius='md' w='100%' onClick={(connected || disableClick) ? undefined : onSelect}>
            <Group justify='space-between'>
                <Group>
                    <Text size='2rem'><Flag countryCode={exit.country_code} h={20} /></Text>
                    <Flex direction='column'>
                        <Text size='md'>{exit.city_name}</Text>
                        <Text c='dimmed' size='sm'>{getExitCountry(exit).name}</Text>
                    </Flex>
                </Group>
                <Group>
                    {connected && <ObscuraChip>{t('Connected')}</ObscuraChip>}
                    {!connected && showLastChosen && <ObscuraChip>{t('lastChosen')}</ObscuraChip>}
                    <ActionIcon className={classes.favoriteBtn} variant={pinned ? 'gradient' : 'outline'} title={pinned ? 'unpin exit' : 'pin exit'} color={pinned ? 'orange' : 'gray'} onClick={onPinClick}>
                        {pinned ? <BsPinFill size='1rem' /> : <BsPin size='1rem' />}
                    </ActionIcon>
                </Group>
            </Group>
        </Card>
    );
}

function NoExitServers() {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);

    if (isLoading) {
        return <Loader mt={10} type='dots' />;
    }

    async function refetch() {
        try {
            setIsLoading(true);
            console.log("Fetching exits");
            await commands.refreshExitList(0);
        } catch (error) {
          let message = error instanceof commands.CommandError
            ? fmtErrorI18n(t, error)
            : t('exitServerFetchResolution');

          notifications.show({
            id: 'failedToFetchExitServers',
            title: t('failedToFetchExitServers'),
            message,
            color: 'red',
          });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Card shadow='sm' padding='lg' radius='md' withBorder w='100%'>
            <Group justify='space-between' >
                <Group align='center' gap={5}>
                    <Text size='xl' fw={700} c='red.7'>
                        {t('noExitServers')}
                    </Text>
                </Group>
                <Button onClick={refetch} color='green.7' radius='md' variant='filled'>
                    {t('refetchExitList')}
                </Button>
            </Group>
        </Card>
    );
}

function VpnStatusCard() {
    const theme = useMantineTheme();
    const { t } = useTranslation();
    const { appStatus, vpnConnected, showOfflineUI, osStatus, connectionInProgress, vpnDisconnect, accountInfo } = useContext(AppContext);

    const getStatusTitle = () => {
        if (connectionInProgress !== ConnectionInProgress.UNSET) return t(connectionInProgress) + '...';
        if (showOfflineUI) return t('Offline');
        const selectedLocation = appStatus.vpnStatus.connected?.exit.city_name;
        // vpnConnected <-> vpnStatus.connected.exit defined
        if (selectedLocation !== undefined) return t('connectedToLocation', { location: selectedLocation });
        return t('Disconnected');
    };

    const getStatusSubtitle = () => {
        if (connectionInProgress === ConnectionInProgress.ChangingLocations) {
          return t('trafficSuspended');
        }
        if (vpnConnected) return t('trafficProtected');
        if (connectionInProgress !== ConnectionInProgress.UNSET) return t('obscuraNotConnected');
        return showOfflineUI ? t('connectToInternet') : t('obscuraNotConnected');
    };

    const isAccountExpired = accountInfo ? accountIsExpired(accountInfo) : false;
    const allowCancel = connectionInProgress === ConnectionInProgress.Connecting || connectionInProgress === ConnectionInProgress.Reconnecting;
    const btnDisabled = !allowCancel && (connectionInProgress === ConnectionInProgress.Disconnecting || connectionInProgress === ConnectionInProgress.ChangingLocations || (showOfflineUI && CONNECT_REQUIRES_ONLINE) || isAccountExpired);
    // No quick connect: the button only appears to disconnect or cancel.
    const showButton = vpnConnected || connectionInProgress !== ConnectionInProgress.UNSET;
    const buttonDisconnectProps = ((allowCancel || vpnConnected) && !btnDisabled) ? theme.other.buttonDisconnectProps : {};

    const getButtonContent = () => {
        if (allowCancel) return t('Cancel Connecting');
        if (connectionInProgress !== ConnectionInProgress.UNSET) return t(connectionInProgress) + '...';
        return t('Disconnect');
    };

    const btnTitle = () => {
        if (!btnDisabled) return;
        if (showOfflineUI) return t('noInternet');
        if (isAccountExpired) return t('account-Expired');
        return t('busyConnection');
    };

    const statusColor = (vpnConnected && connectionInProgress === ConnectionInProgress.UNSET) ? 'green.7'
        : (connectionInProgress === ConnectionInProgress.ChangingLocations ? 'gray' : 'red.7');

    return (
        <Card shadow='sm' padding='lg' radius='md' withBorder w='100%' mb='xs'>
            <Grid justify='space-between' grow>
                <Grid.Col span='content'>
                  <Stack gap={0}>
                      <Group align='center' gap={5}>
                          <ThemeIcon color={statusColor} variant='transparent'>
                              {connectionInProgress === ConnectionInProgress.ChangingLocations
                              ? <Loader size='xs' color='gray.5' /> : (vpnConnected && connectionInProgress === ConnectionInProgress.UNSET)
                              ? <BsShieldFillCheck size={25} />
                              : <BsShieldFillExclamation size={25} />}
                          </ThemeIcon>
                      <Title order={4} fw={600} c={statusColor}>{getStatusTitle()}</Title>
                      </Group>
                      <Text c='gray' size='sm' ml={34}>{getStatusSubtitle()}</Text>
                  </Stack>
                </Grid.Col>
                {showButton && <Grid.Col span='auto'>
                  <Button
                    fullWidth
                    className={commonClasses.button}
                    miw={190}
                    onClick={() => {
                      vpnDisconnect();
                    }}
                    disabled={btnDisabled}
                    title={btnTitle()}
                    px={10}
                    radius='md'
                    {...buttonDisconnectProps}
                  >
                    {getButtonContent()}
                  </Button>
                </Grid.Col>}
            </Grid>
            {osStatus.osVpnStatus !== NEVPNStatus.Disconnected && osStatus.osVpnStatus !== NEVPNStatus.Disconnecting &&
              <>
                <Divider my='md' />
                <Stack justify='space-between' w='100%'>
                  <CurrentSession />
                  {appStatus.vpnStatus.connected === undefined ? <Group justify='center' p='sm'><Loader size='sm' /> {t('exitInfoLoading')}</Group>
                    : <ExitInfo exitPubKey={appStatus.vpnStatus.connected.exitPublicKey} connectedExit={appStatus.vpnStatus.connected.exit} />}
                </Stack>
              </>
            }
        </Card>
    );
}

function CurrentSession() {
  const { t } = useTranslation();
  const { value: trafficStats, refresh: pollTrafficStats, loading } = useAsync({ deps: [], load: commands.getTrafficStats });
  const { osStatus } = useContext(AppContext);
  useInterval(pollTrafficStats, 1000, { autoInvoke: true });
  if (trafficStats === undefined && !loading) return;
  return (
    <Flex gap={5} className={classes.currentSession}>
      <Text c='gray' size='sm'>{t('currentSession')}:</Text>
      {
        trafficStats === undefined ?
          <Text size='sm'>&nbsp;</Text> :
          <Text size='sm'>{fmtTime(osStatus.osVpnStatus === NEVPNStatus.Connected && trafficStats !== undefined ? trafficStats.connectedMs : 0)}</Text>
      }
    </Flex>
  );
}

function ExitInfo({ exitPubKey, connectedExit }: { exitPubKey: string, connectedExit: Exit }) {
  const exitProviderId = connectedExit.provider_id;
  const exitProviderURL = connectedExit.provider_url;
  const provider = connectedExit.provider_name;
  const providerUrl = connectedExit.provider_homepage_url;

  const exitInfoProps = {
    exitPubKey,
    connectedExit,
    exitProviderId,
    exitProviderURL,
    provider,
    providerUrl,
  };
  return IS_HANDHELD_DEVICE ? <ExitInfoDrawer {...exitInfoProps} /> : <ExitInfoCollapse {...exitInfoProps} />;
}

interface ExitInfoProps {
  exitProviderId: string,
  connectedExit: Exit,
  exitPubKey: string,
  provider: string,
  providerUrl: string,
  exitProviderURL: string,
}

function ExitInfoCollapse({ exitProviderId, exitPubKey, connectedExit, provider, providerUrl, exitProviderURL }: ExitInfoProps) {
  const theme = useMantineTheme();
  const { t } = useTranslation();
  const [showExitInfo, setShowExitInfo] = useState(false);
  return (
    <Accordion classNames={{ item: classes.item }} variant='contained' value={showExitInfo ? '0' : null} onChange={() => setShowExitInfo(!showExitInfo)} chevron={null} disableChevronRotation>
      <Accordion.Item key='0' value='0'>
        <Accordion.Control icon={<OrangeCheckedShield height='1em' width='1em' />}>
          <Group justify='space-between'>
            <Text size='sm' c='gray'><Trans i18nKey='securedBy' values={{ provider }} components={[<Anchor onClick={e => e.stopPropagation()} c='orange' href={providerUrl} />]} /></Text>
            <Group style={{ alignItems: 'center' }} gap={5}>
              {showExitInfo ?
                <EyeSlash fill={theme.other.dimmed} width='1em' height='1em' /> :
                <Eye fill={theme.other.dimmed} width='1em' height='1em' />}
              <Text size='xs' c='dimmed' className={classes.serverInfoText}>{t(showExitInfo ? 'serverInfoHide' : 'serverInfoReveal')}</Text>
            </Group>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap={2}>
            <Stack gap={5}>
              <Text c='gray' size='sm'>{t('Node')}</Text>
              <Text size='sm'>
                {exitProviderId}
                <Text span c='dimmed' size='sm'> ({connectedExit.city_name}, {getExitCountry(connectedExit).name})</Text>
              </Text>
            </Stack>
            <Space h='xs' />
            <Stack gap={5}>
              <Text c='gray' size='sm'>{t('publicKey')}</Text>
              <Group gap={3}>
                <Text ff='monospace' size='sm' style={{ wordBreak: 'break-all' }}>{exitPubKey}</Text>
              </Group>
              <MatchesPublicKey exitProviderId={exitProviderId} exitProviderURL={exitProviderURL} />
            </Stack>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function ExitInfoDrawer({ exitProviderId, exitPubKey, connectedExit, provider, providerUrl, exitProviderURL }: ExitInfoProps) {
  const { t } = useTranslation();
  const [showExitInfo, setShowExitInfo] = useState(false);
  return <>
    <SecondaryButton onClick={() => setShowExitInfo(true)}>{t('viewServerInfo')}</SecondaryButton>
    <MobileDrawer size='sm' title={t('networkInformation')} opened={showExitInfo} onClose={() => setShowExitInfo(false)} withCloseButton={false}>
      <Stack justify='space-between' h='100%'>
        <Stack gap='md'>
          <Group justify='space-between'>
            <Text c='dimmed'>{t('VPN')}</Text>
            <Anchor href={providerUrl}>{provider}</Anchor>
          </Group>
          <Stack gap={0}>
            <Group justify='space-between'>
              <Text c='dimmed'>{t('Node')}</Text>
              <Text>{exitProviderId}</Text>
            </Group>
            <Text size='sm' ta='right' className={commonClasses.secondaryColor}>{connectedExit.city_name}, {getExitCountry(connectedExit).name}</Text>
          </Stack>
          <Stack gap={5}>
            <Group justify='space-between' gap={5}>
              <Text c='dimmed'>{t('publicKey')}</Text>
              <Text ff='monospace' style={{ wordBreak: 'break-all' }}>{exitPubKey}</Text>
            </Group>
            <MatchesPublicKey exitProviderId={exitProviderId} exitProviderURL={exitProviderURL} />
          </Stack>
        </Stack>
        <SecondaryButton onClick={() => setShowExitInfo(false)}>{t('Dismiss')}</SecondaryButton>
      </Stack>
    </MobileDrawer>
  </>;
}

interface MatchesPublicKeyProp {
  exitProviderId: string,
  exitProviderURL: string,
}

function MatchesPublicKey({ exitProviderId, exitProviderURL }: MatchesPublicKeyProp) {
  const theme = useMantineTheme();
  return (
    <Text ta={IS_HANDHELD_DEVICE ? 'center' : undefined} size={IS_HANDHELD_DEVICE ? 'xs' : 'sm'} c='green.7' fw={500}>
      <CheckMarkCircleFill height={11} width={11} fill={theme.colors.green[7]} style={{ marginBottom: -1 }} />{' '}
      {t('exitPubKeyTooltip')}{' '}
      <span style={{ display: 'inline-block' }}><Anchor underline='always' href={exitProviderURL}>{exitProviderId}</Anchor>{' '}
        <ThemeIcon variant='transparent' size={12}><ExternalLinkIcon style={{ height: '100%' }} /></ThemeIcon></span>
    </Text>
  );
}
