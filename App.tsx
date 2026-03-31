import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Image,
  Platform,
  Pressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import {
  INFO_BLOCK_IDS,
  type ConnectorStatus,
  type LanguageCode,
  t,
  tInfoBlock,
  tStatus,
} from './i18n';
import { KioskViewport } from './KioskViewport';
import { SCREEN_SCROLL_VERTICAL } from './kioskSpec';

type Screen =
  | 'home'
  | 'language'
  | 'support'
  | 'info'
  | 'pricing'
  | 'specs'
  | 'access'
  | 'qr'
  | 'session'
  | 'rfidPrompt'
  | 'rfidResult'
  | 'startConnectorPick'
  | 'servicePin'
  | 'serviceMenu'
  | 'serviceL1'
  | 'serviceL2'
  | 'serviceL3';

const CONNECTOR_IDLE_SCREENS: Screen[] = [
  'home',
  'language',
  'support',
  'info',
  'pricing',
  'specs',
  'access',
  'qr',
  'session',
  'rfidPrompt',
  'rfidResult',
  'startConnectorPick',
];

type NetworkType = 'wifi' | '4g' | 'eth';
type IconType = 'regular' | 'solid';
type OcppConnectionState = 'ok' | 'connecting' | 'offline';
type QrTarget = {
  title: string;
  value: string;
  returnTo: Screen;
  showPaymentOptions: boolean;
};
const SERVICE_PIN = '123456';
type AuthMode = 'start' | 'session';
type AuthScanType = 'known' | 'unknown' | 'eroaming';
type HelpId = (typeof INFO_BLOCK_IDS)[number];
type HelpSectionType = 'standard' | 'important' | 'tip' | 'next' | 'locate';
type HelpSection = {
  type: HelpSectionType;
  title: string;
  body: string;
};
type HelpPage = {
  id: HelpId;
  title: string;
  intro: string;
  sections: HelpSection[];
};

type PublicPolicy = {
  price: number;
  sessionFee: number;
  parkingPerHour: number;
  graceMinutes: number;
  graceFrom: 'start' | 'end';
  occupyPerHour: number;
  validNow: boolean;
};

type ActiveTx = {
  id: string;
  chargingTime: string;
  costWithVat: number;
};

type TpConnector = {
  id: string;
  evseCpoId: string;
  parkingSpot: string;
  chargingLink?: string;
  plugType: string;
  powerType: 'AC' | 'DC';
  phases: 1 | 3;
  maxAmps: number;
  access: {
    unauthorizedFreeCharging: boolean;
    publicCharging: boolean;
    roamingCharging: boolean;
    privateCharging: boolean;
  };
  hasPublicPolicy: boolean;
  publicPolicy: PublicPolicy;
  budgetAmps?: number;
  vehicleSignalV?: 12 | 9 | 6;
  connectTimeoutSec?: number;
  txTotalSec?: number;
  chargingActiveSec?: number;
  meter: { power: number; energy: number };
  ocpp: { status: ConnectorStatus; _status?: ConnectorStatus[] };
  activeTx: ActiveTx | null;
};

type TouchpointMockConfig = {
  system?: {
    networkOnline?: boolean;
    activeNetwork?: NetworkType;
    iconType?: IconType;
    ocppConnectionState?: OcppConnectionState;
  };
  operator: {
    owner: { name: string };
    provider: { logo: string };
    helpdeskNumber: string;
    helpdeskEmail: string;
    appleStoreLink?: string;
    androidStoreLink?: string;
    chargingLink?: string;
  };
  station: {
    location?: { name?: string };
    name?: string;
    ocppDeviceId?: string;
    defaultLanguage: Exclude<LanguageCode, 'DEV'>;
    currency: string;
    vatRate: number;
    networkOnline?: boolean;
    networkType?: NetworkType;
  };
  connectors: TpConnector[];
};

const mockConfig = require('./mock-config/touchpoint-home.json') as TouchpointMockConfig;
const AGEVOLT_LOGO = require('./assets/branding/agevolt-logo.png');
const APP_ICON_TYPE: IconType = mockConfig.system?.iconType ?? 'solid';
const faProSolid = require('@fortawesome/pro-solid-svg-icons') as Record<string, IconDefinition>;
const faProRegular = require('@fortawesome/pro-regular-svg-icons') as Record<string, IconDefinition>;

const LANGUAGES: LanguageCode[] = ['SK', 'EN', 'DE', 'DEV'];
const ZOOM_TEXT_RULES = {
  actionLabel: { maxLines: 1, targetCharsPerLine: 9 },
  infoNavButton: { maxLines: 1, targetCharsPerLine: 14 },
  infoNavTopic: { maxLines: 3, targetCharsPerLine: 16 },
} as const;
const ContentTextScaleContext = createContext(1);
const ContentIconScaleContext = createContext(1);

function scaleTextStyle(style: StyleProp<TextStyle>, scale: number): StyleProp<TextStyle> {
  if (scale === 1) return style;
  const flat = StyleSheet.flatten(style);
  if (!flat) return style;
  const next: TextStyle = { ...flat };
  if (typeof next.fontSize === 'number') next.fontSize *= scale;
  if (typeof next.lineHeight === 'number') next.lineHeight *= scale;
  return next;
}

function Text(props: React.ComponentProps<typeof RNText>) {
  const scale = useContext(ContentTextScaleContext);
  const { style, ...rest } = props;
  return <RNText {...rest} style={scaleTextStyle(style, scale)} />;
}

function ZoomAdaptiveText({
  children,
  style,
  zoomMaxLines,
  zoomTargetCharsPerLine,
  zoomMinScale = 0.55,
  allowBaseScaleShrink = true,
  fitSingleLine = false,
  ...rest
}: React.ComponentProps<typeof RNText> & {
  zoomMaxLines: number;
  zoomTargetCharsPerLine: number;
  zoomMinScale?: number;
  allowBaseScaleShrink?: boolean;
  fitSingleLine?: boolean;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const desiredScale = useContext(ContentTextScaleContext);
  const text = typeof children === 'string' ? children : '';
  const flat = StyleSheet.flatten(style) ?? {};
  const baseFontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  let effectiveScale = desiredScale;

  if (text && (allowBaseScaleShrink || desiredScale > 1)) {
    const allowedChars = zoomMaxLines * zoomTargetCharsPerLine;
    if (text.length > allowedChars) {
      effectiveScale = Math.max(zoomMinScale, desiredScale * (allowedChars / text.length));
    }
  }

  if (fitSingleLine && text && availableWidth > 0) {
    // Width-aware guard: prefer shrinking to fit exactly one line.
    const approxCharWidth = baseFontSize * 0.52;
    const estimatedLineWidthAtScale1 = text.length * approxCharWidth;
    if (estimatedLineWidthAtScale1 > 0) {
      const scaleFromWidth = availableWidth / estimatedLineWidthAtScale1;
      effectiveScale = Math.min(effectiveScale, Math.max(zoomMinScale, scaleFromWidth));
    }
  }

  return (
    <RNText
      {...rest}
      onLayout={(event) => {
        const measuredWidth = Math.round(event.nativeEvent.layout.width);
        // Prevent shrinking feedback loop: keep the largest measured width.
        // If we keep updating to smaller widths, text keeps shrinking over time.
        if (measuredWidth > availableWidth) setAvailableWidth(measuredWidth);
        rest.onLayout?.(event);
      }}
      style={scaleTextStyle(style, effectiveScale)}
    >
      {children}
    </RNText>
  );
}

function splitSingleWordLabel(label: string): string {
  if (label.includes(' ') || label.length < 10) return label;
  const splitAt = Math.ceil(label.length / 2);
  return `${label.slice(0, splitAt)}\n${label.slice(splitAt)}`;
}

function splitToTwoWordLines(label: string): [string, string?] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [label];
  if (words.length === 2) return [words[0], words[1]];

  let bestSplit = 1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i += 1) {
    const left = words.slice(0, i).join(' ');
    const right = words.slice(i).join(' ');
    const delta = Math.abs(left.length - right.length);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
}

function parseHmsToSec(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split(':').map((item) => Number(item));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatSecToHms(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function devVar(lang: LanguageCode, value: string, key: string): string {
  if (lang === 'DEV') return `{${key}}`;
  return value;
}

function toHelpIndex(initialHelp: number | HelpId): number {
  if (typeof initialHelp === 'number') {
    return Math.max(0, Math.min(INFO_BLOCK_IDS.length - 1, initialHelp));
  }
  const idx = INFO_BLOCK_IDS.indexOf(initialHelp);
  return idx < 0 ? 0 : idx;
}

function resolveHelpIdFromContext(
  selectedConnectorId: string | null,
  connectors: TpConnector[],
  authenticatedByConnector: Record<string, boolean>
): HelpId {
  if (!selectedConnectorId) return 'info-1';
  const c = connectors.find((x) => x.id === selectedConnectorId);
  if (!c) return 'info-1';
  const st = c.ocpp.status;
  const auth = authenticatedByConnector[c.id] ?? false;
  if (st === 'charging' && auth) return 'info-5';
  if (st === 'charging') return 'info-4';
  if (st === 'available' || st === 'EVconnected') return 'info-2';
  if (st === 'connectEV' || st === 'cennectEV' || st === 'preparing') return 'info-3';
  if (st === 'suspendedEV') return 'info-6';
  if (st === 'suspendedEVSE' || st === 'suspended') return 'info-7';
  if (st === 'faulted' || st === 'faultedWithTransa' || st === 'faultedWithoutTransa') return 'info-8';
  if (st === 'finishing') return 'info-3';
  return 'info-1';
}

function buildHelpPage(lang: LanguageCode, id: HelpId): HelpPage {
  const prefix = `info.page.${id}`;
  return {
    id,
    title: tInfoBlock(lang, id, 'title'),
    intro: t(lang, `${prefix}.intro`),
    sections: [
      {
        type: 'standard',
        title: t(lang, 'info.reader.section.howto'),
        body: t(lang, `${prefix}.howto`),
      },
      {
        type: 'important',
        title: t(lang, 'info.reader.section.important'),
        body: t(lang, `${prefix}.important`),
      },
      {
        type: 'locate',
        title: t(lang, 'info.reader.section.locate'),
        body: t(lang, `${prefix}.locate`),
      },
    ],
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [language, setLanguage] = useState<LanguageCode>(mockConfig.station.defaultLanguage);
  const [infoBlockIndex, setInfoBlockIndex] = useState(0);
  const [infoInitialHelpId, setInfoInitialHelpId] = useState<HelpId>(INFO_BLOCK_IDS[0]);
  const [infoReturnTarget, setInfoReturnTarget] = useState<Screen>('home');
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [connectorAuthenticated, setConnectorAuthenticated] = useState<Record<string, boolean>>({});
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [servicePinInput, setServicePinInput] = useState('');
  const [servicePinError, setServicePinError] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('start');
  const [authScanType, setAuthScanType] = useState<AuthScanType>('known');
  const [magnifierOn, setMagnifierOn] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const logoTapCountRef = useRef(0);
  const logoTapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConnectorScopeActivityRef = useRef(Date.now());
  const txStartTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const txStopTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [connectorRuntime, setConnectorRuntime] = useState(() =>
    Object.fromEntries(
      mockConfig.connectors.map((connector) => [
        connector.id,
        { status: connector.ocpp.status, activeTx: connector.activeTx as ActiveTx | null },
      ])
    ) as Record<string, { status: ConnectorStatus; activeTx: ActiveTx | null }>
  );
  const runtimeConnectors = useMemo(
    () =>
      mockConfig.connectors.map((connector) => {
        const runtime = connectorRuntime[connector.id];
        return {
          ...connector,
          ocpp: { status: runtime?.status ?? connector.ocpp.status },
          activeTx: runtime?.activeTx ?? connector.activeTx,
        };
      }),
    [connectorRuntime]
  );
  const currentConnector = useMemo(
    () => runtimeConnectors.find((item) => item.id === selectedConnectorId) ?? null,
    [runtimeConnectors, selectedConnectorId]
  );
  const effectiveConnectorIdForContext = useMemo(
    () =>
      selectedConnectorId ??
      (runtimeConnectors.length === 1 ? runtimeConnectors[0]?.id ?? null : null),
    [selectedConnectorId, runtimeConnectors]
  );
  const [isNetworkOnline, setIsNetworkOnline] = useState(
    mockConfig.system?.networkOnline ?? mockConfig.station.networkOnline ?? true
  );
  const [networkType, setNetworkType] = useState<NetworkType>(
    mockConfig.system?.activeNetwork ?? mockConfig.station.networkType ?? 'wifi'
  );
  const [ocppConnectionState, setOcppConnectionState] = useState<OcppConnectionState>(
    mockConfig.system?.ocppConnectionState ?? 'ok'
  );
  const stationLocationName = mockConfig.station.location?.name ?? 'Location';
  const stationName = mockConfig.station.name ?? 'Station 01';
  const stationDeviceId = mockConfig.station.ocppDeviceId ?? 'TP-DEVICE-001';
  const androidStoreLink = mockConfig.operator.androidStoreLink ?? 'https://play.google.com/store';
  const appleStoreLink = mockConfig.operator.appleStoreLink ?? 'https://apps.apple.com';
  const chargingLink = mockConfig.operator.chargingLink ?? 'https://charge.agevolt.com';
  const contentTextScale = magnifierOn ? 2 : 1;
  const contentIconScale = magnifierOn ? 2 : 1;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (logoTapResetTimerRef.current) clearTimeout(logoTapResetTimerRef.current);
      Object.values(txStartTimersRef.current).forEach((timer) => clearTimeout(timer));
      Object.values(txStopTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const clearConnectorSession = useCallback(() => {
    setSelectedConnectorId(null);
    setConnectorAuthenticated({});
  }, []);

  const handleSelectConnector = useCallback((connectorId: string) => {
    setConnectorAuthenticated({});
    setSelectedConnectorId(connectorId);
  }, []);

  const openInfo = (initialHelp?: number | HelpId, returnTarget: Screen = 'home') => {
    const resolvedId =
      initialHelp === undefined
        ? resolveHelpIdFromContext(effectiveConnectorIdForContext, runtimeConnectors, connectorAuthenticated)
        : initialHelp;
    const idx = toHelpIndex(resolvedId);
    setInfoBlockIndex(idx);
    setInfoInitialHelpId(INFO_BLOCK_IDS[idx]);
    setInfoReturnTarget(returnTarget === 'info' ? 'home' : returnTarget);
    setScreen('info');
  };

  useEffect(() => {
    if (effectiveConnectorIdForContext !== null && CONNECTOR_IDLE_SCREENS.includes(screen)) {
      lastConnectorScopeActivityRef.current = Date.now();
    }
  }, [screen, effectiveConnectorIdForContext]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (effectiveConnectorIdForContext === null) return;
      if (!CONNECTOR_IDLE_SCREENS.includes(screen)) return;
      if (Date.now() - lastConnectorScopeActivityRef.current > 60000) {
        clearConnectorSession();
        if (screen !== 'home') {
          setScreen('home');
        }
        lastConnectorScopeActivityRef.current = Date.now();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [screen, effectiveConnectorIdForContext, clearConnectorSession]);
  const openQr = (
    title: string,
    value: string,
    options?: { returnTo?: Screen; showPaymentOptions?: boolean }
  ) => {
    setQrTarget({
      title,
      value,
      returnTo: options?.returnTo ?? 'support',
      showPaymentOptions: options?.showPaymentOptions ?? false,
    });
    setScreen('qr');
  };

  const cycleNetworkState = () => {
    if (!isNetworkOnline) {
      setIsNetworkOnline(true);
      setNetworkType('wifi');
      return;
    }
    if (networkType === 'wifi') {
      setNetworkType('4g');
      return;
    }
    if (networkType === '4g') {
      setNetworkType('eth');
      return;
    }
    setIsNetworkOnline(false);
  };

  const cycleOcppState = () => {
    setOcppConnectionState((prev) =>
      prev === 'ok' ? 'connecting' : prev === 'connecting' ? 'offline' : 'ok'
    );
  };

  const startMockTransaction = (connectorId: string) => {
    if (txStopTimersRef.current[connectorId]) clearTimeout(txStopTimersRef.current[connectorId]);
    if (txStartTimersRef.current[connectorId]) clearTimeout(txStartTimersRef.current[connectorId]);
    setConnectorRuntime((prev) => ({
      ...prev,
      [connectorId]: {
        status: 'preparing',
        activeTx: {
          id: `tx-${Date.now()}`,
          chargingTime: '00:00:00',
          costWithVat: 0,
        },
      },
    }));
    txStartTimersRef.current[connectorId] = setTimeout(() => {
      setConnectorRuntime((prev) => {
        if (!prev[connectorId]?.activeTx) return prev;
        return {
          ...prev,
          [connectorId]: {
            ...prev[connectorId],
            status: 'charging',
            activeTx: {
              ...prev[connectorId].activeTx!,
              chargingTime: '00:00:08',
              costWithVat: 0.18,
            },
          },
        };
      });
      delete txStartTimersRef.current[connectorId];
    }, 1400);
  };

  const stopMockTransaction = (connectorId: string) => {
    if (txStartTimersRef.current[connectorId]) clearTimeout(txStartTimersRef.current[connectorId]);
    setConnectorRuntime((prev) => ({
      ...prev,
      [connectorId]: {
        ...prev[connectorId],
        status: 'finishing',
      },
    }));
    if (txStopTimersRef.current[connectorId]) clearTimeout(txStopTimersRef.current[connectorId]);
    txStopTimersRef.current[connectorId] = setTimeout(() => {
      setConnectorRuntime((prev) => ({
        ...prev,
        [connectorId]: {
          status: 'available',
          activeTx: null,
        },
      }));
      delete txStopTimersRef.current[connectorId];
    }, 1800);
  };

  const startableConnectorIds = useMemo(
    () =>
      runtimeConnectors
        .filter(
          (connector) =>
            !connector.activeTx &&
            (connector.ocpp.status === 'available' ||
              connector.ocpp.status === 'EVconnected' ||
              connector.ocpp.status === 'connectEV' ||
              connector.ocpp.status === 'cennectEV')
        )
        .map((connector) => connector.id),
    [runtimeConnectors]
  );

  const isServiceScreen =
    screen === 'servicePin' ||
    screen === 'serviceMenu' ||
    screen === 'serviceL1' ||
    screen === 'serviceL2' ||
    screen === 'serviceL3';

  const resetServicePin = () => {
    setServicePinInput('');
    setServicePinError('');
  };

  const onLogoTap = () => {
    if (isServiceScreen) {
      resetServicePin();
      setScreen('home');
      return;
    }

    logoTapCountRef.current += 1;
    if (logoTapResetTimerRef.current) clearTimeout(logoTapResetTimerRef.current);
    logoTapResetTimerRef.current = setTimeout(() => {
      logoTapCountRef.current = 0;
    }, 1400);

    if (logoTapCountRef.current >= 5) {
      logoTapCountRef.current = 0;
      if (logoTapResetTimerRef.current) clearTimeout(logoTapResetTimerRef.current);
      resetServicePin();
      setScreen('servicePin');
    }
  };

  return (
    <>
      <StatusBar style="dark" />
      <KioskViewport>
        <View style={styles.appFrame}>
          <TopHeader
            lang={language}
            providerName={mockConfig.operator.owner.name}
            providerLogo={mockConfig.operator.provider.logo}
            now={now}
            isNetworkOnline={isNetworkOnline}
            networkType={networkType}
            ocppConnectionState={ocppConnectionState}
            onCycleNetwork={cycleNetworkState}
            onCycleOcpp={cycleOcppState}
            magnifierOn={magnifierOn}
            onToggleMagnifier={() => setMagnifierOn((prev) => !prev)}
            onLogoTap={onLogoTap}
          />

          <View style={styles.contentViewport}>
            <ContentTextScaleContext.Provider value={contentTextScale}>
              <ContentIconScaleContext.Provider value={contentIconScale}>
                <View
                  style={styles.contentZoomLayer}
                  onTouchStart={() => {
                    if (
                      effectiveConnectorIdForContext !== null &&
                      CONNECTOR_IDLE_SCREENS.includes(screen)
                    ) {
                      lastConnectorScopeActivityRef.current = Date.now();
                    }
                  }}
                >
              {screen === 'home' &&
                (magnifierOn ? (
                  <ScrollView
                    style={styles.homeZoomScroll}
                    contentContainerStyle={styles.homeZoomScrollContent}
                    horizontal={false}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator
                    bounces={false}
                  >
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo()}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                    <StationSection
                      lang={language}
                      stationLocationName={stationLocationName}
                      stationName={stationName}
                      stationDeviceId={stationDeviceId}
                      showStationBack={runtimeConnectors.length > 1 && selectedConnectorId !== null}
                      onStationHomePress={() => {
                        clearConnectorSession();
                        setScreen('home');
                      }}
                    >
                      <HomeOverviewScreen
                        lang={language}
                        connectors={runtimeConnectors}
                        currency={mockConfig.station.currency}
                        fallbackChargingLink={chargingLink}
                        selectedConnectorId={selectedConnectorId}
                        onSelectConnector={handleSelectConnector}
                        onOpenPricing={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('pricing');
                        }}
                        onOpenSpecs={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('specs');
                        }}
                        onOpenAccess={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('access');
                        }}
                        onOpenSession={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('session');
                        }}
                        onStartAuth={(connectorId, mode) => {
                          setSelectedConnectorId(connectorId);
                          setAuthMode(mode);
                          setScreen('rfidPrompt');
                        }}
                        onOpenSupport={() => setScreen('support')}
                        onOpenQr={openQr}
                      />
                    </StationSection>
                  </ScrollView>
                ) : (
                  <View style={styles.homeNoScroll}>
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo()}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                    <StationSection
                      lang={language}
                      stationLocationName={stationLocationName}
                      stationName={stationName}
                      stationDeviceId={stationDeviceId}
                      showStationBack={runtimeConnectors.length > 1 && selectedConnectorId !== null}
                      onStationHomePress={() => {
                        clearConnectorSession();
                        setScreen('home');
                      }}
                    >
                      <HomeOverviewScreen
                        lang={language}
                        connectors={runtimeConnectors}
                        currency={mockConfig.station.currency}
                        fallbackChargingLink={chargingLink}
                        selectedConnectorId={selectedConnectorId}
                        onSelectConnector={handleSelectConnector}
                        onOpenPricing={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('pricing');
                        }}
                        onOpenSpecs={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('specs');
                        }}
                        onOpenAccess={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('access');
                        }}
                        onOpenSession={(connectorId) => {
                          setSelectedConnectorId(connectorId);
                          setScreen('session');
                        }}
                        onStartAuth={(connectorId, mode) => {
                          setSelectedConnectorId(connectorId);
                          setAuthMode(mode);
                          setScreen('rfidPrompt');
                        }}
                        onOpenSupport={() => setScreen('support')}
                        onOpenQr={openQr}
                      />
                    </StationSection>
                  </View>
                ))}

              {screen === 'language' && (
                <FullscreenOverlay
                  headerIcon="globe-europe"
                  title={t(language, 'language.overlayTitle')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                >
                  <Text style={styles.overlayText}>{t(language, 'language.pick')}</Text>
                  <View style={styles.languageRow}>
                    {LANGUAGES.map((item) => (
                      <Pressable
                        key={item}
                        style={({ pressed }) => [
                          styles.languageButton,
                          language === item && styles.languageButtonActive,
                          pressed && styles.infoActionPressed,
                        ]}
                        onPress={() => {
                          setLanguage(item);
                          setScreen('home');
                        }}
                      >
                        <View style={styles.languageButtonMain}>
                          <Text
                            style={[
                              styles.languageButtonText,
                              language === item && styles.languageButtonTextActive,
                            ]}
                          >
                            {t(language, `language.name.${item}`)}
                          </Text>
                        </View>
                        <View style={styles.languageButtonStrip}>
                          <RNText style={styles.languageButtonStripArrow}>›</RNText>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </FullscreenOverlay>
              )}

              {screen === 'support' && (
                <FullscreenOverlay
                  headerIcon="headset"
                  title={t(language, 'support.overlayTitle')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.support}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                >
                  <SupportContent
                    lang={language}
                    onToggleZoom={() => setMagnifierOn((prev) => !prev)}
                    helpdeskNumber={devVar(language, mockConfig.operator.helpdeskNumber, 'operator.helpdeskNumber')}
                    helpdeskEmail={devVar(language, mockConfig.operator.helpdeskEmail, 'operator.helpdeskEmail')}
                    androidStoreLink={devVar(language, androidStoreLink, 'operator.androidStoreLink')}
                    appleStoreLink={devVar(language, appleStoreLink, 'operator.appleStoreLink')}
                    chargingLink={devVar(language, chargingLink, 'operator.chargingLink')}
                    onOpenQr={openQr}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'info' && (
                <InfoReader
                  lang={language}
                  initialHelpId={infoInitialHelpId}
                  returnTarget={infoReturnTarget}
                  index={infoBlockIndex}
                  onBack={() => setScreen(infoReturnTarget)}
                  onPrev={() => setInfoBlockIndex((prev) => Math.max(0, prev - 1))}
                  onNext={() =>
                    setInfoBlockIndex((prev) => Math.min(INFO_BLOCK_IDS.length - 1, prev + 1))
                  }
                  onSelectTopic={(nextIndex) =>
                    setInfoBlockIndex(Math.max(0, Math.min(INFO_BLOCK_IDS.length - 1, nextIndex)))
                  }
                />
              )}

              {screen === 'pricing' && currentConnector && (
                <FullscreenOverlay
                  title={t(language, 'pricing.overlayTitle')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.pricing}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                  secondaryRowFirst
                  secondaryRow={
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo(undefined, 'pricing')}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                  }
                >
                  <PricingContent
                    lang={language}
                    connector={currentConnector}
                    currency={mockConfig.station.currency}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'access' && currentConnector && (
                <FullscreenOverlay
                  title={t(language, 'access.overlayTitle')}
                  scrollVertical={SCREEN_SCROLL_VERTICAL.access}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                  secondaryRowFirst
                  secondaryRow={
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo(undefined, 'access')}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                  }
                >
                  <AccessContent
                    lang={language}
                    connector={currentConnector}
                    currency={mockConfig.station.currency}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'specs' && currentConnector && (
                <FullscreenOverlay
                  title="Technicke parametre"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.access}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                  secondaryRowFirst
                  secondaryRow={
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo(undefined, 'specs')}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                  }
                >
                  <SpecsContent lang={language} connector={currentConnector} />
                </FullscreenOverlay>
              )}

              {screen === 'session' && currentConnector && (
                <FullscreenOverlay
                  title="Detail session"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.access}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                  secondaryRowFirst
                  secondaryRow={
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo(undefined, 'session')}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                  }
                >
                  <SessionContent
                    lang={language}
                    connector={currentConnector}
                    onStop={() => {
                      stopMockTransaction(currentConnector.id);
                      setSelectedConnectorId(currentConnector.id);
                      setScreen('home');
                    }}
                    onUnlock={() => {
                      setAuthMode('session');
                      setScreen('rfidPrompt');
                    }}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'rfidPrompt' && (
                <FullscreenOverlay
                  title={authMode === 'start' ? 'Prilozte RFID kartu' : 'Overenie pouzivatela'}
                  scrollVertical={false}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                  secondaryRowFirst
                  secondaryRow={
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo(undefined, 'rfidPrompt')}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                  }
                >
                  <RfidPromptContent
                    mode={authMode}
                    onSimulate={(scanType) => {
                      setAuthScanType(scanType);
                      if (scanType === 'known') {
                        if (authMode === 'start') {
                          if (startableConnectorIds.length > 1) {
                            setScreen('startConnectorPick');
                          } else if (startableConnectorIds.length === 1) {
                            const connectorId = startableConnectorIds[0];
                            setSelectedConnectorId(connectorId);
                            setConnectorAuthenticated((p) => ({ ...p, [connectorId]: true }));
                            startMockTransaction(connectorId);
                            setScreen('session');
                          } else {
                            setScreen('rfidResult');
                          }
                          return;
                        }
                        if (selectedConnectorId) {
                          setConnectorAuthenticated((p) => ({ ...p, [selectedConnectorId]: true }));
                        }
                        setScreen('session');
                        return;
                      }
                      setScreen('rfidResult');
                    }}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'startConnectorPick' && (
                <FullscreenOverlay
                  title="Vyberte konektor"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                >
                  <StartConnectorPickContent
                    connectors={runtimeConnectors.filter((connector) =>
                      startableConnectorIds.includes(connector.id)
                    )}
                    onSelect={(connectorId) => {
                      setSelectedConnectorId(connectorId);
                      setConnectorAuthenticated((p) => ({ ...p, [connectorId]: true }));
                      startMockTransaction(connectorId);
                      setScreen('session');
                    }}
                    onCancel={() => setScreen('home')}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'rfidResult' && (
                <FullscreenOverlay
                  title="Vysledok overenia karty"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => setScreen('home')}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                >
                  <RfidResultContent
                    mode={authMode}
                    scanType={authScanType}
                    onContinue={() => {
                      if (authMode === 'start' && startableConnectorIds.length > 0) {
                        setScreen('startConnectorPick');
                        return;
                      }
                      if (authMode === 'session' && currentConnector?.activeTx) {
                        setScreen('session');
                        return;
                      }
                      setScreen('home');
                    }}
                    onClose={() => setScreen('home')}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'qr' && qrTarget && (
                <FullscreenOverlay
                  headerIcon="qrcode"
                  title={qrTarget.title}
                  scrollVertical={false}
                  onClose={() => setScreen(qrTarget.returnTo)}
                  useBackButton
                  backLabel={t(language, 'info.reader.back')}
                  secondaryRowFirst
                  secondaryRow={
                    <QuickActionsBar
                      lang={language}
                      onInfo={() => openInfo(undefined, 'qr')}
                      onSupport={() => setScreen('support')}
                      onLanguage={() => setScreen('language')}
                    />
                  }
                >
                  <QrContent
                    lang={language}
                    value={qrTarget.value}
                    showPaymentOptions={qrTarget.showPaymentOptions}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'servicePin' && (
                <FullscreenOverlay
                  title="Servisne menu"
                  scrollVertical={false}
                  onClose={() => undefined}
                  showCloseButton={false}
                >
                  <ServicePinContent
                    pinInput={servicePinInput}
                    error={servicePinError}
                    onInput={(digit) => {
                      if (servicePinInput.length >= 6) return;
                      setServicePinError('');
                      setServicePinInput((prev) => `${prev}${digit}`);
                    }}
                    onDelete={() => {
                      setServicePinError('');
                      setServicePinInput((prev) => prev.slice(0, -1));
                    }}
                    onClear={() => {
                      setServicePinError('');
                      setServicePinInput('');
                    }}
                    onSubmit={() => {
                      if (servicePinInput === SERVICE_PIN) {
                        resetServicePin();
                        setScreen('serviceMenu');
                        return;
                      }
                      setServicePinError('Nespravny PIN');
                    }}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'serviceMenu' && (
                <FullscreenOverlay
                  title="Servisne menu"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => undefined}
                  showCloseButton={false}
                >
                  <ServiceMenuList
                    items={[
                      { id: 'service.l1', title: 'Komunikacia a siet', onPress: () => setScreen('serviceL1') },
                      { id: 'service.quick', title: 'Rychly test portu', onPress: () => setScreen('serviceL1') },
                    ]}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'serviceL1' && (
                <FullscreenOverlay
                  title="Komunikacia a siet"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => setScreen('serviceMenu')}
                  useBackButton
                  backLabel="Spat"
                >
                  <ServiceMenuList
                    items={[
                      { id: 'service.l2', title: 'OCPP a synchronizacia', onPress: () => setScreen('serviceL2') },
                      { id: 'service.l2b', title: 'Diagnostika spojenia', onPress: () => setScreen('serviceL2') },
                    ]}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'serviceL2' && (
                <FullscreenOverlay
                  title="OCPP a synchronizacia"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => setScreen('serviceL1')}
                  useBackButton
                  backLabel="Spat"
                >
                  <ServiceMenuList
                    items={[
                      { id: 'service.l3', title: 'Offline cache a reset', onPress: () => setScreen('serviceL3') },
                      { id: 'service.l3b', title: 'Export diagnostiky', onPress: () => setScreen('serviceL3') },
                    ]}
                  />
                </FullscreenOverlay>
              )}

              {screen === 'serviceL3' && (
                <FullscreenOverlay
                  title="Offline cache a reset"
                  scrollVertical={SCREEN_SCROLL_VERTICAL.language}
                  onClose={() => setScreen('serviceL2')}
                  useBackButton
                  backLabel="Spat"
                >
                  <ServiceFinalContent />
                </FullscreenOverlay>
              )}
                </View>
              </ContentIconScaleContext.Provider>
            </ContentTextScaleContext.Provider>
          </View>
        </View>
      </KioskViewport>
    </>
  );
}

function TopHeader({
  lang,
  providerName,
  providerLogo,
  now,
  isNetworkOnline,
  networkType,
  ocppConnectionState,
  onCycleNetwork,
  onCycleOcpp,
  magnifierOn,
  onToggleMagnifier,
  onLogoTap,
}: {
  lang: LanguageCode;
  providerName: string;
  providerLogo: string;
  now: Date;
  isNetworkOnline: boolean;
  networkType: NetworkType;
  ocppConnectionState: OcppConnectionState;
  onCycleNetwork: () => void;
  onCycleOcpp: () => void;
  magnifierOn: boolean;
  onToggleMagnifier: () => void;
  onLogoTap: () => void;
}) {
  const locale = lang === 'DE' ? 'de-DE' : lang === 'EN' ? 'en-GB' : 'sk-SK';
  const dateTime = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const networkIcon: React.ComponentProps<typeof FontAwesome5>['name'] =
    networkType === 'wifi' ? 'wifi' : networkType === '4g' ? 'signal' : 'network-wired';
  const ocppIcon: React.ComponentProps<typeof FontAwesome5>['name'] =
    ocppConnectionState === 'ok'
      ? 'link'
      : ocppConnectionState === 'connecting'
        ? 'sync-alt'
        : 'unlink';

  return (
    <View style={styles.header}>
      <View style={[styles.headerThird, styles.headerThirdLeft]}>
        <View style={styles.ownerNameRow}>
          {lang === 'DEV' ? (
            <FitText style={styles.headerIconTypeKey} minScale={0.52} targetChars={18}>
              {'{system.iconType}'}
            </FitText>
          ) : (
            <AppIcon name="user-tie" size={28} />
          )}
          <FitText style={styles.headerProviderName} minScale={0.4} targetChars={10}>
            {devVar(lang, providerName, 'operator.owner.name')}
          </FitText>
        </View>
      </View>

      <View style={[styles.headerThird, styles.headerThirdCenter]}>
        <FitText style={styles.headerDateTime} minScale={0.7} targetChars={17}>
          {dateTime}
        </FitText>
        <View style={styles.networkLine}>
          <Pressable onPress={onCycleNetwork} style={styles.headerIconPressTarget}>
            {lang === 'DEV' ? (
              <FitText style={styles.headerNetworkKey} minScale={0.52} targetChars={20}>
                {'{system.activeNetwork}'}
              </FitText>
            ) : isNetworkOnline ? (
              <AppIcon name={networkIcon} size={21} />
            ) : (
              <AppIcon name="times-circle" size={19} />
            )}
          </Pressable>
          {lang !== 'DEV' ? (
            <Pressable onPress={onCycleOcpp} style={styles.ocppBadge}>
              <AppIcon name={ocppIcon} size={19} />
              <FitText style={styles.ocppBadgeText} minScale={0.7} targetChars={6}>
                OCPP
              </FitText>
            </Pressable>
          ) : null}
          {lang === 'DEV' ? (
            <Pressable onPress={onCycleOcpp} style={styles.headerIconPressTarget}>
              <FitText style={styles.headerNetworkKey} minScale={0.52} targetChars={24}>
                {'{system.ocppConnectionState}'}
              </FitText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[styles.headerThird, styles.headerThirdRight]}>
        <View style={styles.headerRightRow}>
          <Pressable style={styles.logoBox} onPress={onLogoTap}>
            {lang === 'DEV' ? (
              <FitText style={styles.logoWordmark} minScale={0.4} targetChars={10}>
                {devVar(lang, providerLogo, 'operator.provider.logo')}
              </FitText>
            ) : (
              <Image source={AGEVOLT_LOGO} style={styles.logoImage} resizeMode="contain" />
            )}
          </Pressable>
          <Pressable
            style={[styles.topMagnifierButton, magnifierOn && styles.topMagnifierButtonActive]}
            onPress={onToggleMagnifier}
          >
            <AppIcon
              name={magnifierOn ? 'search-minus' : 'search-plus'}
              size={36}
              color={magnifierOn ? '#ffffff' : '#000000'}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StationSection({
  lang,
  stationLocationName,
  stationName,
  stationDeviceId,
  children,
  showStationBack,
  onStationHomePress,
}: {
  lang: LanguageCode;
  stationLocationName: string;
  stationName: string;
  stationDeviceId: string;
  children: ReactNode;
  showStationBack?: boolean;
  onStationHomePress?: () => void;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  const stationJoinedName =
    lang === 'DEV'
      ? '{station.location.name} - {station.name}'
      : `${stationLocationName} - ${stationName}`;
  const stationDeviceIdShort = lang === 'DEV' ? '{station.ocppDeviceId}' : stationDeviceId.slice(0, 8);

  const headerContent = (
    <>
      {showStationBack ? (
        <View style={styles.stationBackStrip} pointerEvents="none">
          <RNText style={styles.stationBackArrow}>‹</RNText>
        </View>
      ) : null}
      <View
        style={[
          styles.stationTitleRow,
          isZoomed && styles.stationTitleRowZoom,
          showStationBack && styles.stationTitleRowWithBackStrip,
        ]}
      >
        <View style={[styles.stationTitleIconSlot, isZoomed && styles.stationTitleIconSlotZoom]}>
          <AppIcon name="charging-station" />
        </View>
        <FitText style={styles.stationName} minScale={0.35} targetChars={22}>
          {stationJoinedName}
        </FitText>
      </View>
      <View style={styles.stationIdBlock}>
        <FitText style={styles.stationIdValue} minScale={0.55} targetChars={12} numberOfLines={1}>
          {stationDeviceIdShort}
        </FitText>
      </View>
    </>
  );

  return (
    <View style={styles.stationShell}>
      {showStationBack && onStationHomePress ? (
        <Pressable
          style={({ pressed }) => [
            styles.stationHeader,
            styles.stationHeaderWithBackStrip,
            pressed && styles.stationHeaderPressed,
          ]}
          onPress={onStationHomePress}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View style={styles.stationHeader}>{headerContent}</View>
      )}
      <View style={styles.stationBody}>{children}</View>
    </View>
  );
}

function QuickActionsBar({
  lang,
  onInfo,
  onSupport,
  onLanguage,
}: {
  lang: LanguageCode;
  onInfo: () => void;
  onSupport: () => void;
  onLanguage: () => void;
}) {
  return (
    <View style={styles.actionsRow}>
      <ActionButton icon="info-circle" label={t(lang, 'actions.info')} onPress={onInfo} />
      <ActionButton icon="headset" label={t(lang, 'actions.support')} onPress={onSupport} />
      <ActionButton
        icon="globe-europe"
        label={lang}
        onPress={onLanguage}
      />
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  label: string;
  onPress: () => void;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  const actionTargetChars = label.length >= 7 ? 5 : ZOOM_TEXT_RULES.actionLabel.targetCharsPerLine;
  return (
    <Pressable style={[styles.actionButton, isZoomed && styles.actionButtonZoom]} onPress={onPress}>
      <View style={[styles.actionIconSlot, isZoomed && styles.actionIconSlotZoom]}>
        <AppIcon name={icon} size={26} />
      </View>
      <ZoomAdaptiveText
        style={[styles.actionLabel, isZoomed && styles.actionLabelZoom]}
        zoomMaxLines={ZOOM_TEXT_RULES.actionLabel.maxLines}
        zoomTargetCharsPerLine={actionTargetChars}
        zoomMinScale={0.2}
        allowBaseScaleShrink={false}
        fitSingleLine
      >
        {label}
      </ZoomAdaptiveText>
      <View style={styles.actionButtonStrip}>
        <RNText style={styles.actionButtonStripArrow}>›</RNText>
      </View>
    </Pressable>
  );
}

function FitText({
  children,
  style,
  minScale = 0.28,
  targetChars = 14,
  numberOfLines,
}: {
  children: ReactNode;
  style: StyleProp<TextStyle>;
  minScale?: number;
  targetChars?: number;
  numberOfLines?: number;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const baseFontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  const text = typeof children === 'string' ? children : '';
  const heuristicScale =
    text.length > targetChars ? Math.max(minScale, targetChars / text.length) : 1;
  const fontSize = Math.round(baseFontSize * heuristicScale * 100) / 100;
  const lineHeight = Math.max(Math.ceil(fontSize * 1.24), fontSize + 3);

  return (
    <Text
      allowFontScaling={false}
      numberOfLines={numberOfLines}
      ellipsizeMode={numberOfLines === 1 ? 'clip' : undefined}
      style={[style, { fontSize, lineHeight, paddingBottom: 1 }]}
    >
      {children}
    </Text>
  );
}

function toFaExportName(name: string): string {
  const parts = name.split('-').filter(Boolean);
  return `fa${parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
}

function resolveProIcon(name: string, preferRegular: boolean): IconDefinition | null {
  const exportName = toFaExportName(name);
  const regular = faProRegular[exportName];
  const solid = faProSolid[exportName];
  if (preferRegular) return regular ?? solid ?? null;
  return solid ?? regular ?? null;
}

function AppIcon({
  name,
  size,
  color = '#000000',
}: {
  name: React.ComponentProps<typeof FontAwesome5>['name'] | 'car-side-bolt';
  size?: number;
  color?: string;
}) {
  const useRegular = APP_ICON_TYPE === 'regular';
  const contentIconScale = useContext(ContentIconScaleContext);
  const renderedSize = Math.max(size ?? ICON_SIZE, ICON_SIZE) * contentIconScale;
  const proIcon = resolveProIcon(name, useRegular);
  if (proIcon) {
    return <FontAwesomeIcon icon={proIcon} size={renderedSize} color={color} />;
  }
  if (name === 'car-side-bolt') {
    return <FontAwesome6 name="car-side-bolt" size={renderedSize} color={color} />;
  }
  return (
    <FontAwesome5
      name={name}
      size={renderedSize}
      color={color}
      solid={!useRegular}
      regular={useRegular}
    />
  );
}

function getPlugTypeTranslationKey(plugType: string): string | null {
  const value = plugType.trim().toLowerCase();
  if (value === 'type 2 outlet') return 'connector.plugType.type2Outlet';
  return null;
}

function yesNo(lang: LanguageCode, value: boolean): string {
  if (lang === 'DE') return value ? 'Ja' : 'Nein';
  if (lang === 'EN') return value ? 'Yes' : 'No';
  return value ? 'Áno' : 'Nie';
}

function getConnectorAccessMode(connector: TpConnector): string {
  if (connector.access.unauthorizedFreeCharging) return 'Free';
  if (connector.access.privateCharging && !connector.access.publicCharging) return 'Private / Shared';
  if (connector.access.publicCharging && connector.access.roamingCharging) return 'Public + eRoaming';
  if (connector.access.publicCharging) return 'Public';
  return 'Private';
}

function HomeOverviewScreen({
  lang,
  connectors,
  currency,
  fallbackChargingLink,
  selectedConnectorId,
  onSelectConnector,
  onOpenPricing,
  onOpenSpecs,
  onOpenAccess,
  onOpenSession,
  onStartAuth,
  onOpenSupport,
  onOpenQr,
}: {
  lang: LanguageCode;
  connectors: TpConnector[];
  currency: string;
  fallbackChargingLink: string;
  selectedConnectorId: string | null;
  onSelectConnector: (connectorId: string) => void;
  onOpenPricing: (connectorId: string) => void;
  onOpenSpecs: (connectorId: string) => void;
  onOpenAccess: (connectorId: string) => void;
  onOpenSession: (connectorId: string) => void;
  onStartAuth: (connectorId: string, mode: AuthMode) => void;
  onOpenSupport: () => void;
  onOpenQr: (
    title: string,
    value: string,
    options?: { returnTo?: Screen; showPaymentOptions?: boolean }
  ) => void;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  const connectStartByConnectorRef = useRef<Record<string, number>>({});
  const singleConnector = connectors.length === 1;
  const focusedConnector = singleConnector
    ? connectors[0] ?? null
    : connectors.find((item) => item.id === selectedConnectorId) ?? null;

  const getStatusLabel = (connector: TpConnector): string => {
    const status = connector.ocpp.status;
    if (status === 'available') return 'Voľný';
    if (status === 'EVconnected') return 'Vozidlo pripojené';
    if (status === 'connectEV' || status === 'cennectEV') return 'Pripojte vozidlo';
    if (status === 'preparing') return 'Príprava';
    if (status === 'charging') return 'Nabíjanie';
    if (status === 'suspendedEV') return 'Ukončené';
    if (status === 'suspendedEVSE' || status === 'suspended') return 'Blokované';
    if (status === 'finishing') return 'Ukončovanie';
    if (status === 'faulted' || status === 'faultedWithTransa' || status === 'faultedWithoutTransa') {
      return 'Chyba';
    }
    return 'Chyba';
  };

  const renderOverviewCard = (connector: TpConnector, cardIndex: number) => {
    const connectorPowerBadge = connector.powerType === 'AC' ? `AC${connector.phases}` : 'DC';
    const maxPowerKw = calculateMaxPowerKw(connector.powerType, connector.phases, connector.maxAmps);
    const isRightConnector = !singleConnector && cardIndex % 2 === 1;
    const status = connector.ocpp.status;
    const txActiveByStatus =
      status === 'connectEV' ||
      status === 'cennectEV' ||
      status === 'preparing' ||
      status === 'charging' ||
      status === 'suspendedEV' ||
      status === 'suspendedEVSE' ||
      status === 'faultedWithTransa' ||
      status === 'finishing';
    const statusPreview = getStatusLabel(connector);
    const statusLines = splitToTwoWordLines(statusPreview);
    const isFaultWithoutTx = status === 'faultedWithoutTransa' || status === 'faulted';
    const isFaultWithTx = status === 'faultedWithTransa';
    const showConnectCountdown = status === 'connectEV' || status === 'cennectEV';
    const showLiveSessionData = txActiveByStatus;
    const isPreparingPhase = status === 'preparing';
    const isChargingPhase = status === 'charging';
    const isFinishedByVehicle = status === 'suspendedEV';
    const isBlockedByStation = status === 'suspendedEVSE' || status === 'suspended';
    const showTimeRowsInMiddle = isChargingPhase || isFinishedByVehicle || isBlockedByStation;
    const showEnergyOnlyInBottom = isFinishedByVehicle || isBlockedByStation || isFaultWithTx;
    const showSecondBubbleAction = !txActiveByStatus || isFaultWithoutTx || isFaultWithTx;
    const budgetAmps = connector.budgetAmps ?? 10;
    const vehicleSignalV = connector.vehicleSignalV ?? 6;
    const budgetOk = budgetAmps >= 6;
    const vehicleOk = vehicleSignalV === 6;
    const vehicleState =
      vehicleSignalV === 12
        ? { icon: 'unlink' as React.ComponentProps<typeof FontAwesome5>['name'], label: 'Odpojené' }
        : vehicleSignalV === 9
          ? { icon: 'pause-circle' as React.ComponentProps<typeof FontAwesome5>['name'], label: 'Čaká' }
          : { icon: 'check-circle' as React.ComponentProps<typeof FontAwesome5>['name'], label: 'Pripravené' };
    const connectTimeoutSec = connector.connectTimeoutSec ?? 300;
    const txTotalSec =
      connector.txTotalSec ?? parseHmsToSec(connector.activeTx?.chargingTime) ?? 0;
    const chargingActiveSec =
      connector.chargingActiveSec ?? Math.max(0, txTotalSec);
    if (txActiveByStatus && !connectStartByConnectorRef.current[connector.id]) {
      connectStartByConnectorRef.current[connector.id] = Date.now();
    }
    if (!txActiveByStatus && connectStartByConnectorRef.current[connector.id]) {
      delete connectStartByConnectorRef.current[connector.id];
    }
    const connectElapsedSec = txActiveByStatus
      ? Math.floor((Date.now() - (connectStartByConnectorRef.current[connector.id] ?? Date.now())) / 1000)
      : 0;
    const connectRemainingSec = Math.max(0, connectTimeoutSec - connectElapsedSec);
    const connectCountdown = `${String(Math.floor(connectRemainingSec / 60)).padStart(2, '0')}:${String(
      connectRemainingSec % 60
    ).padStart(2, '0')}`;
    const powerNumberText = connector.meter.power.toFixed(1);
    const energyNumberText = connector.meter.energy.toFixed(2);
    const connectorLabelRaw = devVar(lang, connector.parkingSpot, 'connector.parkingSpot');
    const connectorLabel =
      lang === 'DEV'
        ? connectorLabelRaw
        : connectorLabelRaw.slice(0, 5).padEnd(5, connectorLabelRaw.slice(-1) || 'X');
    return (
      <View
        key={connector.id}
        style={[
          styles.connectorCard,
          singleConnector && styles.connectorCardSingle,
          styles.connectorCardOverview,
        ]}
      >
        <View style={styles.connectorOverviewBody}>
          <Pressable
            style={({ pressed }) => [
              styles.connectorOverviewRow,
              isRightConnector ? styles.connectorOverviewRowClickable : styles.connectorOverviewRowClickableLeft,
              pressed && styles.connectorBubblePressed,
            ]}
            onPress={() => onSelectConnector(connector.id)}
          >
            <View style={styles.connectorOverviewCellSplit}>
              <View style={styles.connectorOverviewCellHalf}>
                <FitText style={styles.connectorNameOverview} minScale={0.62} targetChars={5}>
                  {connectorLabel}
                </FitText>
              </View>
              <View style={styles.connectorOverviewCellDivider} />
              <View style={styles.connectorOverviewCellHalf}>
                <View style={styles.connectorOverviewStatusWrap}>
                  <FitText style={styles.connectorOverviewStatusInlineLine} minScale={0.22} targetChars={6}>
                    {statusLines[0]}
                  </FitText>
                  {statusLines[1] ? (
                    <FitText style={styles.connectorOverviewStatusInlineLine} minScale={0.22} targetChars={6}>
                      {statusLines[1]}
                    </FitText>
                  ) : null}
                </View>
              </View>
            </View>
            {isRightConnector ? (
              <View style={styles.connectorBubbleActionStrip}>
                <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
              </View>
            ) : (
              <View style={styles.connectorBubbleActionStripLeft}>
                <RNText style={styles.connectorBubbleActionStripArrow}>‹</RNText>
              </View>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.connectorOverviewRow,
              showSecondBubbleAction
                ? isRightConnector
                  ? styles.connectorOverviewRowClickable
                  : styles.connectorOverviewRowClickableLeft
                : null,
              pressed && styles.connectorBubblePressed,
            ]}
            onPress={() => {
              if (!showSecondBubbleAction) {
                onSelectConnector(connector.id);
                return;
              }
              if (isFaultWithoutTx || isFaultWithTx) {
                onOpenSupport();
                return;
              }
              if (!txActiveByStatus) {
                onOpenQr(
                  `${devVar(lang, connector.parkingSpot, 'connector.parkingSpot')} - ${devVar(
                    lang,
                    connector.evseCpoId,
                    'connector.evseCpoId'
                  )}`,
                  devVar(lang, connector.chargingLink ?? fallbackChargingLink, 'connector.chargingLink'),
                  { returnTo: 'home', showPaymentOptions: connector.hasPublicPolicy }
                );
                return;
              }
              onOpenSession(connector.id);
            }}
          >
            <View style={styles.connectorOverviewCellSplit}>
              <View style={styles.connectorOverviewCellHalf}>
                {isFaultWithoutTx || isFaultWithTx ? (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorQrButtonTextMobileLine} minScale={0.45} targetChars={8}>
                      Podpora
                    </FitText>
                  </View>
                ) : !txActiveByStatus ? (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorQrButtonTextMobileLine} minScale={0.45} targetChars={8}>
                      Spustiť
                    </FitText>
                    <FitText style={styles.connectorQrButtonTextMobileLine} minScale={0.45} targetChars={8}>
                      mobilom
                    </FitText>
                  </View>
                ) : showConnectCountdown ? (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorTxValue} minScale={0.5} targetChars={8}>
                      {connectCountdown}
                    </FitText>
                  </View>
                ) : isPreparingPhase ? (
                  <View style={styles.connectorPrepareFlowWrap}>
                    <View style={styles.connectorPrepareStatusRow}>
                      <AppIcon name="charging-station" size={42} />
                      <Text style={styles.connectorPrepareStatusMark}>{budgetOk ? '✓' : '✕'}</Text>
                    </View>
                  </View>
                ) : showTimeRowsInMiddle ? (
                  <View style={styles.connectorPrepareFlowWrap}>
                    <View style={styles.connectorTimeRow}>
                      <View style={styles.connectorTimeHeaderRow}>
                        <AppIcon name="clock" size={44} />
                        <FitText style={styles.connectorTimeLabel} minScale={0.6} targetChars={7}>
                          Celkom
                        </FitText>
                      </View>
                      <FitText style={styles.connectorTxValue} minScale={0.5} targetChars={8}>
                        {formatSecToHms(txTotalSec)}
                      </FitText>
                    </View>
                  </View>
                ) : (
                  <View style={styles.connectorOverviewMobileTextWrap}>
                    <FitText style={styles.connectorMiniLabel} minScale={0.6} targetChars={8}>
                      Budget
                    </FitText>
                    <FitText style={styles.connectorTxValue} minScale={0.5} targetChars={6}>
                      {`${budgetAmps} A`}
                    </FitText>
                  </View>
                )}
              </View>
              <View style={styles.connectorOverviewCellDivider} />
              <View style={styles.connectorOverviewCellHalf}>
                {isFaultWithoutTx || isFaultWithTx ? (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name="headset" size={50} />
                  </View>
                ) : !txActiveByStatus ? (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name="qrcode" size={50} />
                    <AppIcon name="mobile-alt" size={50} />
                  </View>
                ) : showConnectCountdown ? (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name="car-side-bolt" size={56} />
                  </View>
                ) : isPreparingPhase ? (
                  <View style={styles.connectorPrepareFlowWrap}>
                    <View style={styles.connectorPrepareStatusRow}>
                      <AppIcon name="car-side-bolt" size={46} />
                      <Text style={styles.connectorPrepareStatusMark}>{vehicleOk ? '✓' : '✕'}</Text>
                    </View>
                  </View>
                ) : showTimeRowsInMiddle ? (
                  <View style={styles.connectorPrepareFlowWrap}>
                    <View style={styles.connectorTimeRow}>
                      <View style={styles.connectorTimeHeaderRow}>
                        <AppIcon name="bolt" size={44} />
                        <FitText style={styles.connectorTimeLabel} minScale={0.6} targetChars={9}>
                          Nabíjanie
                        </FitText>
                      </View>
                      <FitText style={styles.connectorTxValue} minScale={0.5} targetChars={8}>
                        {formatSecToHms(chargingActiveSec)}
                      </FitText>
                    </View>
                  </View>
                ) : (
                  <View style={styles.connectorOverviewIconRow}>
                    <AppIcon name={vehicleState.icon} size={46} />
                    <FitText style={styles.connectorMiniLabel} minScale={0.6} targetChars={9}>
                      {vehicleState.label}
                    </FitText>
                  </View>
                )}
              </View>
            </View>
            {showSecondBubbleAction
              ? isRightConnector ? (
                  <View style={styles.connectorBubbleActionStrip}>
                    <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
                  </View>
                ) : (
                  <View style={styles.connectorBubbleActionStripLeft}>
                    <RNText style={styles.connectorBubbleActionStripArrow}>‹</RNText>
                  </View>
                )
              : null}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.connectorOverviewRow, pressed && styles.connectorBubblePressed]}
            onPress={() => onSelectConnector(connector.id)}
          >
            {showEnergyOnlyInBottom ? (
              <View style={styles.connectorOverviewCellFull}>
                <FitText style={styles.connectorOverviewLiveValueNumberFull} minScale={0.45} targetChars={6}>
                  {energyNumberText}
                </FitText>
                <View style={styles.connectorOverviewUnitRowFull}>
                  <AppIcon name="battery-half" size={40} />
                  <FitText style={styles.connectorOverviewLiveUnitTextFull} minScale={0.65} targetChars={4}>
                    kWh
                  </FitText>
                </View>
              </View>
            ) : (
              <View style={styles.connectorOverviewCellSplit}>
                <View style={styles.connectorOverviewCellHalf}>
                  {showLiveSessionData ? (
                    <>
                      <FitText style={styles.connectorOverviewLiveValueNumber} minScale={0.45} targetChars={5}>
                        {powerNumberText}
                      </FitText>
                      <View style={styles.connectorOverviewUnitRow}>
                        <AppIcon name="bolt" size={34} />
                        <FitText style={styles.connectorOverviewLiveUnitText} minScale={0.6} targetChars={3}>
                          kW
                        </FitText>
                      </View>
                    </>
                  ) : (
                    <FitText style={styles.connectorOverviewPowerTypeBig} minScale={0.5} targetChars={4}>
                      {connectorPowerBadge}
                    </FitText>
                  )}
                </View>
                <View style={styles.connectorOverviewCellDivider} />
                <View style={styles.connectorOverviewCellHalf}>
                  {showLiveSessionData ? (
                    <>
                      <FitText style={styles.connectorOverviewLiveValueNumber} minScale={0.4} targetChars={6}>
                        {energyNumberText}
                      </FitText>
                      <View style={styles.connectorOverviewUnitRow}>
                        <AppIcon name="battery-half" size={34} />
                        <FitText style={styles.connectorOverviewLiveUnitText} minScale={0.6} targetChars={4}>
                          kWh
                        </FitText>
                      </View>
                    </>
                  ) : (
                    <FitText style={styles.connectorOverviewPowerKwBig} minScale={0.5} targetChars={5}>
                      {`${maxPowerKw.toFixed(0)} kW`}
                    </FitText>
                  )}
                </View>
              </View>
            )}
          </Pressable>

        </View>
      </View>
    );
  };

  if (!focusedConnector) {
    return (
      <ContentTextScaleContext.Provider value={1}>
        <ContentIconScaleContext.Provider value={1}>
          <View style={styles.connectorArea}>
            {connectors.map((connector, idx) => renderOverviewCard(connector, idx))}
          </View>
        </ContentIconScaleContext.Provider>
      </ContentTextScaleContext.Provider>
    );
  }

  const maxPowerKw = calculateMaxPowerKw(
    focusedConnector.powerType,
    focusedConnector.phases,
    focusedConnector.maxAmps
  );
  const focusedConnectorLabelRaw = devVar(lang, focusedConnector.parkingSpot, 'connector.parkingSpot');
  const focusedConnectorLabel =
    lang === 'DEV'
      ? focusedConnectorLabelRaw
      : focusedConnectorLabelRaw.slice(0, 5).padEnd(5, focusedConnectorLabelRaw.slice(-1) || 'X');
  const connectorPowerBadge = focusedConnector.powerType === 'AC' ? `AC${focusedConnector.phases}` : 'DC';
  const plugTypeKey = getPlugTypeTranslationKey(focusedConnector.plugType);
  const plugTypeLabel = plugTypeKey ? t(lang, plugTypeKey) : focusedConnector.plugType;
  const primaryCta =
    focusedConnector.ocpp.status === 'finishing'
      ? null
      : focusedConnector.ocpp.status === 'faulted'
      ? focusedConnector.activeTx
        ? { label: 'Overit usera', onPress: () => onStartAuth(focusedConnector.id, 'session') }
        : null
      : focusedConnector.activeTx
        ? { label: 'Overit usera', onPress: () => onStartAuth(focusedConnector.id, 'session') }
        : { label: 'Zacat nabijanie', onPress: () => onStartAuth(focusedConnector.id, 'start') };

  const focusedConnectorIndex = connectors.findIndex((c) => c.id === focusedConnector.id);
  const showConnectorSideArrow = connectors.length > 1 && focusedConnectorIndex >= 0;
  const isRightConnectorDetail = showConnectorSideArrow && focusedConnectorIndex % 2 === 1;
  const connectorDetailSideIconSize = Math.round(TYPO.superLarge * 1.72);

  return (
    <ContentTextScaleContext.Provider value={1}>
      <ContentIconScaleContext.Provider value={1}>
        <View style={styles.connectorArea}>
          <View style={[styles.connectorCard, styles.connectorCardSingle, styles.connectorCardFocused]}>
        <View style={[styles.connectorIdentityRow, styles.connectorIdentityRowFocused]}>
          <View
            style={[
              styles.connectorIdentityMain,
              styles.connectorIdentityMainFocused,
              showConnectorSideArrow && styles.connectorIdentityMainWithSideArrow,
            ]}
          >
            {showConnectorSideArrow && !isRightConnectorDetail ? (
              <AppIcon name="arrow-left" size={connectorDetailSideIconSize} />
            ) : null}
            <FitText style={styles.connectorNameOverview} minScale={0.5} targetChars={5}>
              {focusedConnectorLabel}
            </FitText>
            {showConnectorSideArrow && isRightConnectorDetail ? (
              <AppIcon name="arrow-right" size={connectorDetailSideIconSize} />
            ) : null}
          </View>
        </View>

        <View style={[styles.connectorBubble, isZoomed && styles.connectorBubbleZoom]}>
          <Text style={styles.connectorHeroStatus}>{getStatusLabel(focusedConnector)}</Text>
          <Text style={styles.connectorHeroLive}>{`${focusedConnector.meter.power.toFixed(1)} kW  |  ${focusedConnector.meter.energy.toFixed(2)} kWh`}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.connectorBubble,
            isZoomed && styles.connectorBubbleZoom,
            styles.connectorBubbleClickable,
            pressed && styles.connectorBubblePressed,
          ]}
          onPress={() => onOpenSpecs(focusedConnector.id)}
        >
          <Text style={styles.connectorBubbleLabel}>FCID a technicke info</Text>
          <FitText style={styles.connectorBubbleValue} minScale={0.26} targetChars={18}>
            {devVar(lang, focusedConnector.evseCpoId, 'connector.evseCpoId')}
          </FitText>
          <View style={styles.connectorTypeValueRow}>
            <AppIcon name="bolt" size={18} />
            <Text style={styles.connectorBubbleValue}>{connectorPowerBadge}</Text>
            <Text style={styles.connectorBubbleValue}>{`${maxPowerKw.toFixed(0)} kW`}</Text>
            <Text style={styles.connectorBubbleValue}>{lang === 'DEV' ? '{connector.plugType}' : plugTypeLabel}</Text>
          </View>
          <View style={styles.connectorBubbleActionStrip}>
            <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.connectorBubble,
            isZoomed && styles.connectorBubbleZoom,
            styles.connectorBubbleClickable,
            pressed && styles.connectorBubblePressed,
          ]}
          onPress={() =>
            focusedConnector.hasPublicPolicy
              ? onOpenPricing(focusedConnector.id)
              : onOpenAccess(focusedConnector.id)
          }
        >
          <Text style={styles.connectorBubbleLabel}>{t(lang, 'connector.accessPricing')}</Text>
          <Text style={styles.connectorBubbleValue}>
            {focusedConnector.access.unauthorizedFreeCharging
              ? 'Bez autorizacie (Free)'
              : focusedConnector.access.privateCharging
                ? 'Private / Shared'
                : focusedConnector.access.roamingCharging
                  ? 'Public + eRoaming'
                  : 'Public'}
          </Text>
          {focusedConnector.hasPublicPolicy ? (
            <Text style={styles.connectorBubbleValue}>
              {`Cena ${focusedConnector.publicPolicy.price.toFixed(2)} ${currency}/kWh${focusedConnector.publicPolicy.sessionFee > 0 || focusedConnector.publicPolicy.parkingPerHour > 0 ? ' + poplatky' : ''}`}
            </Text>
          ) : null}
          <View style={styles.connectorBubbleActionStrip}>
            <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.connectorBubble,
            isZoomed && styles.connectorBubbleZoom,
            styles.connectorBubbleClickable,
            pressed && styles.connectorBubblePressed,
          ]}
          onPress={() => onOpenSession(focusedConnector.id)}
        >
          <Text style={styles.connectorBubbleLabel}>Additional info o session</Text>
          <Text style={styles.connectorBubbleValue}>{`Stav: ${getStatusLabel(focusedConnector)}`}</Text>
          <Text style={styles.connectorBubbleValue}>{`Cas: ${focusedConnector.activeTx?.chargingTime ?? '--:--:--'}`}</Text>
          <View style={styles.connectorBubbleActionStrip}>
            <RNText style={styles.connectorBubbleActionStripArrow}>›</RNText>
          </View>
        </Pressable>

        {primaryCta ? (
          <Pressable style={styles.connectorPrimaryCta} onPress={primaryCta.onPress}>
            <Text style={styles.connectorPrimaryCtaText}>{primaryCta.label}</Text>
          </Pressable>
        ) : (
          <View style={styles.connectorPrimaryCtaDisabled}>
            <Text style={[styles.connectorPrimaryCtaText, styles.connectorPrimaryCtaTextDisabled]}>
              Nabijanie nie je dostupne
            </Text>
          </View>
        )}
          </View>
        </View>
      </ContentIconScaleContext.Provider>
    </ContentTextScaleContext.Provider>
  );
}

function Chip({
  icon,
  value,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  value: string;
}) {
  return (
    <View style={styles.chip}>
      <AppIcon name={icon} size={14} />
      <Text style={styles.chipText}>{value}</Text>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function FullscreenOverlay({
  headerIcon,
  title,
  scrollVertical,
  children,
  onClose,
  useBackButton = false,
  backLabel,
  secondaryRow,
  secondaryRowFirst = false,
  showCloseButton = true,
}: {
  headerIcon?: React.ComponentProps<typeof FontAwesome5>['name'];
  title: string;
  scrollVertical: boolean;
  children: ReactNode;
  onClose: () => void;
  useBackButton?: boolean;
  backLabel?: string;
  secondaryRow?: ReactNode;
  secondaryRowFirst?: boolean;
  showCloseButton?: boolean;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  const body = scrollVertical ? (
    <ScrollView
      style={[styles.overlayCard, styles.overlayScrollView]}
      contentContainerStyle={styles.overlayScrollContent}
      horizontal={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator
      bounces={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.overlayCard}>{children}</View>
  );

  return (
    <View style={styles.overlayWrap}>
      {secondaryRowFirst && secondaryRow ? <View style={styles.overlaySecondaryRow}>{secondaryRow}</View> : null}
      <View style={[styles.overlayHeader, isZoomed && styles.overlayHeaderZoom]}>
            {useBackButton ? (
              <>
                <View style={styles.overlayHeaderBackSlot}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.overlayBackButtonActionLeft,
                      pressed && styles.infoActionPressed,
                    ]}
                    onPress={onClose}
                  >
                    <View style={styles.overlayBackButtonStripLeft}>
                      <RNText style={styles.overlayBackButtonStripArrow}>‹</RNText>
                    </View>
                    <FitText style={styles.overlayBackButtonText} minScale={0.55} targetChars={8}>
                      {backLabel ?? 'Späť'}
                    </FitText>
                  </Pressable>
                </View>
                <View style={[styles.overlayTitleRow, styles.overlayTitleRowWithBack]}>
                  {headerIcon ? (
                    <View style={styles.overlayTitleIconSlot}>
                      <AppIcon name={headerIcon} size={24} />
                    </View>
                  ) : null}
                  <ZoomAdaptiveText
                    style={styles.overlayTitle}
                    zoomMaxLines={1}
                    zoomTargetCharsPerLine={18}
                    zoomMinScale={0.24}
                    fitSingleLine
                  >
                    {title}
                  </ZoomAdaptiveText>
                </View>
                <View style={styles.overlayHeaderRightSpacer} />
              </>
            ) : (
              <View style={styles.overlayTitleRow}>
                {headerIcon ? (
                  <View style={styles.overlayTitleIconSlot}>
                    <AppIcon name={headerIcon} size={24} />
                  </View>
                ) : null}
                <ZoomAdaptiveText
                  style={styles.overlayTitle}
                  zoomMaxLines={1}
                  zoomTargetCharsPerLine={22}
                  zoomMinScale={0.3}
                  fitSingleLine
                >
                  {title}
                </ZoomAdaptiveText>
              </View>
            )}
            {!useBackButton && showCloseButton ? (
              <Pressable style={styles.closeButton} onPress={onClose}>
                <RNText style={styles.closeText}>X</RNText>
              </Pressable>
            ) : null}
          </View>
      {!secondaryRowFirst && secondaryRow ? <View style={styles.overlaySecondaryRow}>{secondaryRow}</View> : null}
      {body}
    </View>
  );
}

function InfoLine({
  icon,
  value,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  value: string;
}) {
  return (
    <View style={styles.infoLine}>
      <AppIcon name={icon} size={22} />
      <Text style={styles.infoLineText}>{value}</Text>
    </View>
  );
}

function SupportContent({
  lang,
  onToggleZoom,
  helpdeskNumber,
  helpdeskEmail,
  androidStoreLink,
  appleStoreLink,
  chargingLink,
  onOpenQr,
}: {
  lang: LanguageCode;
  onToggleZoom: () => void;
  helpdeskNumber: string;
  helpdeskEmail: string;
  androidStoreLink: string;
  appleStoreLink: string;
  chargingLink: string;
  onOpenQr: (title: string, value: string) => void;
}) {
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchTriggeredRef = useRef(false);
  const isAndroid = Platform.OS === 'android';

  const distance = (a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) =>
    Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

  const onTouchStart = (event: any) => {
    if (!isAndroid) return;
    const touches = event?.nativeEvent?.touches;
    if (!touches || touches.length < 2) return;
    pinchStartDistanceRef.current = distance(touches[0], touches[1]);
    pinchTriggeredRef.current = false;
  };

  const onTouchMove = (event: any) => {
    if (!isAndroid) return;
    const touches = event?.nativeEvent?.touches;
    if (!touches || touches.length < 2 || pinchStartDistanceRef.current == null) return;
    const currentDistance = distance(touches[0], touches[1]);
    const ratio = currentDistance / pinchStartDistanceRef.current;
    if (!pinchTriggeredRef.current && (ratio > 1.18 || ratio < 0.85)) {
      pinchTriggeredRef.current = true;
      onToggleZoom();
    }
  };

  const onTouchEnd = () => {
    pinchStartDistanceRef.current = null;
    pinchTriggeredRef.current = false;
  };

  return (
    <View
      style={styles.supportWrap}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <Text style={styles.supportIntro}>
        {t(lang, 'support.intro')}
      </Text>
      <Text style={styles.supportBody}>
        {t(lang, 'support.lead')}
      </Text>

      <View style={styles.supportCards}>
        <SupportRow
          icon="phone-alt"
          title={helpdeskNumber}
          subtitle={`${t(lang, 'support.phoneCardTitle')} - ${t(lang, 'support.phoneCardHint')}`}
          onOpenQr={() => onOpenQr(t(lang, 'actions.support'), `tel:${helpdeskNumber}`)}
          qrLabel={t(lang, 'support.showQr')}
          emphasizeTitle
        />
        <SupportRow
          icon="envelope"
          title={helpdeskEmail}
          subtitle={`${t(lang, 'support.emailCardTitle')} - ${t(lang, 'support.emailCardHint')}`}
          onOpenQr={() => onOpenQr('E-mail', `mailto:${helpdeskEmail}`)}
          qrLabel={t(lang, 'support.showQr')}
        />
      </View>

      <View style={styles.supportInfoCard}>
        <Text style={styles.supportInfoTitle}>
          {t(lang, 'support.mailPrepTitle')}
        </Text>
        <SupportInfoItem icon="user-tie" text={t(lang, 'support.mailPrepOwner')} />
        <SupportInfoItem icon="charging-station" text={t(lang, 'support.mailPrepStation')} />
        <SupportInfoItem icon="plug" text={t(lang, 'support.mailPrepConnector')} />
        <SupportInfoItem icon="clock" text={t(lang, 'support.mailPrepTime')} />
      </View>

      <Text style={styles.supportFootnote}>
        {t(lang, 'support.callbackHint')}
      </Text>

      <Text style={styles.supportAppsHeading}>
        {t(lang, 'support.appsHint')}
      </Text>
      <View style={styles.supportCards}>
        <SupportRow
          icon="android"
          title={t(lang, 'support.androidApp')}
          subtitle={t(lang, 'support.androidApp')}
          onOpenQr={() => onOpenQr(t(lang, 'support.androidApp'), androidStoreLink)}
          qrLabel={t(lang, 'support.showQr')}
        />
        <SupportRow
          icon="apple"
          title={t(lang, 'support.appleApp')}
          subtitle={t(lang, 'support.appleApp')}
          onOpenQr={() => onOpenQr(t(lang, 'support.appleApp'), appleStoreLink)}
          qrLabel={t(lang, 'support.showQr')}
        />
        <SupportRow
          icon="globe-europe"
          title={t(lang, 'support.webApp')}
          subtitle={t(lang, 'support.webApp')}
          onOpenQr={() => onOpenQr(t(lang, 'support.webApp'), chargingLink)}
          qrLabel={t(lang, 'support.showQr')}
        />
      </View>
    </View>
  );
}

function SupportInfoItem({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  text: string;
}) {
  return (
    <View style={styles.supportInfoItemRow}>
      <AppIcon name={icon} size={18} />
      <Text style={styles.supportInfoItem}>{text}</Text>
    </View>
  );
}

function SupportRow({
  icon,
  title,
  subtitle,
  qrLabel,
  onOpenQr,
  emphasizeTitle,
}: {
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  title: string;
  subtitle: string;
  qrLabel: string;
  onOpenQr: () => void;
  emphasizeTitle?: boolean;
}) {
  return (
    <View style={styles.supportRow}>
      <View style={styles.supportRowMain}>
        <AppIcon name={icon} size={24} />
        <View style={styles.supportRowTextWrap}>
          <FitText
            style={[
              styles.supportRowTitle,
              emphasizeTitle && styles.supportRowTitleStrong,
            ]}
            minScale={0.58}
            targetChars={18}
          >
            {title}
          </FitText>
          <Text style={styles.supportRowSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Pressable style={styles.supportQrButton} onPress={onOpenQr}>
        <AppIcon name="qrcode" size={20} />
        <Text style={styles.supportQrButtonText}>{qrLabel}</Text>
      </Pressable>
    </View>
  );
}

function buildQrUri(value: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(value)}`;
}

function QrContent({
  lang,
  value,
  showPaymentOptions,
}: {
  lang: LanguageCode;
  value: string;
  showPaymentOptions: boolean;
}) {
  const paymentOptions: Array<{ icon: React.ComponentProps<typeof FontAwesome5>['name']; label: string }> = [
    { icon: 'credit-card', label: t(lang, 'qr.pay.googlePay') },
    { icon: 'mobile-alt', label: t(lang, 'qr.pay.applePay') },
    { icon: 'bolt', label: t(lang, 'qr.pay.fastPay') },
    { icon: 'credit-card', label: t(lang, 'qr.pay.cards') },
  ];

  return (
    <View style={styles.qrWrap}>
      <Image source={{ uri: buildQrUri(value) }} style={styles.qrImage} />
      <FitText style={styles.qrHint} minScale={0.62} targetChars={26}>
        {t(lang, 'support.qrHint')}
      </FitText>
      <FitText style={styles.qrValue} minScale={0.34} targetChars={30}>
        {value}
      </FitText>
      {showPaymentOptions ? (
        <View style={styles.qrPaymentWrap}>
          <FitText style={styles.qrPaymentTitle} minScale={0.62} targetChars={30}>
            {t(lang, 'qr.pay.title')}
          </FitText>
          <View style={styles.qrPaymentGrid}>
            {paymentOptions.map((item) => (
              <View key={item.label} style={styles.qrPaymentChip}>
                <AppIcon name={item.icon} size={24} />
                <FitText style={styles.qrPaymentChipText} minScale={0.66} targetChars={14}>
                  {item.label}
                </FitText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ServiceMenuList({ items }: { items: Array<{ id: string; title: string; onPress: () => void }> }) {
  return (
    <View style={styles.serviceMenuWrap}>
      <View style={styles.serviceMenuItems}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.serviceMenuItem, pressed && styles.infoActionPressed]}
            onPress={item.onPress}
          >
            <View style={styles.serviceMenuItemMain}>
              <FitText style={styles.serviceMenuItemText} minScale={0.5} targetChars={28}>
                {item.title}
              </FitText>
            </View>
            <View style={styles.serviceMenuItemStrip}>
              <RNText style={styles.serviceMenuItemArrow}>›</RNText>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ServicePinContent({
  pinInput,
  error,
  onInput,
  onDelete,
  onClear,
  onSubmit,
}: {
  pinInput: string;
  error: string;
  onInput: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const keypadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', 'DEL'],
  ];
  return (
    <View style={styles.servicePinWrap}>
      <Text style={styles.servicePinTitle}>Zadajte servisny PIN</Text>
      <View style={styles.servicePinBox}>
        <Text style={styles.servicePinValue}>{pinInput.replace(/./g, '*').padEnd(6, '_')}</Text>
      </View>
      {error ? <Text style={styles.servicePinError}>{error}</Text> : null}

      <View style={styles.serviceKeypad}>
        {keypadRows.map((row) => (
          <View key={row.join('-')} style={styles.serviceKeypadRow}>
            {row.map((cell) => (
              <Pressable
                key={cell}
                style={({ pressed }) => [styles.serviceKey, pressed && styles.infoActionPressed]}
                onPress={() => {
                  if (cell === 'C') {
                    onClear();
                    return;
                  }
                  if (cell === 'DEL') {
                    onDelete();
                    return;
                  }
                  onInput(cell);
                }}
              >
                <Text style={styles.serviceKeyText}>{cell}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <Pressable style={({ pressed }) => [styles.servicePinSubmit, pressed && styles.infoActionPressed]} onPress={onSubmit}>
        <Text style={styles.servicePinSubmitText}>Vstupit do menu</Text>
      </Pressable>
    </View>
  );
}

function ServiceFinalContent() {
  return (
    <View style={styles.serviceFinalWrap}>
      <Text style={styles.serviceFinalTitle}>Mock akcie (uroven 3)</Text>
      <View style={styles.serviceFinalCard}>
        <Text style={styles.serviceFinalLabel}>- Reset lokalnej cache</Text>
        <Text style={styles.serviceFinalLabel}>- Simulacia restartu frontend app</Text>
        <Text style={styles.serviceFinalLabel}>- Export poslednych 50 logov</Text>
      </View>
      <Text style={styles.serviceFinalHint}>Klik na logo AGEVOLT v hornom riadku vrati kiosk do bezneho Home rezimu.</Text>
    </View>
  );
}

function InfoReader({
  lang,
  initialHelpId: _initialHelpId,
  returnTarget: _returnTarget,
  index,
  onBack,
  onPrev,
  onNext,
  onSelectTopic,
}: {
  lang: LanguageCode;
  initialHelpId: HelpId;
  returnTarget: Screen;
  index: number;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectTopic: (nextIndex: number) => void;
}) {
  const contentTextScale = useContext(ContentTextScaleContext);
  const isZoomed = contentTextScale > 1;
  const [showTopicList, setShowTopicList] = useState(false);
  const n = INFO_BLOCK_IDS.length;
  const topicIds = INFO_BLOCK_IDS.slice(0, 15);
  const currentId = INFO_BLOCK_IDS[index];
  const prevId = index > 0 ? INFO_BLOCK_IDS[index - 1] : null;
  const nextId = index < n - 1 ? INFO_BLOCK_IDS[index + 1] : null;
  const page = buildHelpPage(lang, currentId);

  return (
    <View style={styles.infoReaderWrap}>
      <View style={[styles.infoReaderHeader, isZoomed && styles.infoReaderHeaderZoom]}>
        <View style={[styles.infoReaderHeaderSideSlot, isZoomed && styles.infoReaderHeaderSideSlotZoom]}>
          <Pressable
            style={({ pressed }) => [
              styles.infoBackButton,
              styles.infoBackButtonActionLeft,
              isZoomed && styles.infoBackButtonActionLeftZoom,
              isZoomed && styles.infoReaderHeaderControlZoom,
              pressed && styles.infoActionPressed,
            ]}
            onPress={onBack}
          >
            <View style={styles.infoBackButtonStripLeft}>
              <RNText style={styles.infoBackButtonStripArrow}>‹</RNText>
            </View>
            <ZoomAdaptiveText
              style={[styles.infoBackButtonText, isZoomed && styles.infoBackButtonTextZoom]}
              zoomMaxLines={1}
              zoomTargetCharsPerLine={4}
              zoomMinScale={0.22}
              allowBaseScaleShrink={false}
              fitSingleLine
            >
              {t(lang, 'info.reader.back')}
            </ZoomAdaptiveText>
          </Pressable>
        </View>
        <ZoomAdaptiveText
          style={[styles.infoReaderHeaderTitle, isZoomed && styles.infoReaderHeaderTitleZoom]}
          zoomMaxLines={2}
          zoomTargetCharsPerLine={8}
          zoomMinScale={0.42}
          allowBaseScaleShrink={false}
        >
          {t(lang, 'info.reader.title')}
        </ZoomAdaptiveText>
        <View style={[styles.infoReaderHeaderSideSlot, isZoomed && styles.infoReaderHeaderSideSlotZoom]}>
          <View
            style={[
              styles.infoReaderProgressBox,
              isZoomed && styles.infoReaderProgressBoxZoom,
              isZoomed && styles.infoReaderHeaderControlZoom,
            ]}
          >
            {isZoomed ? (
              <View style={styles.infoReaderProgressZoomWrap}>
                <Text style={styles.infoReaderProgressZoomLine}>
                  {String(index + 1).padStart(2, '0')}/
                </Text>
                <Text style={styles.infoReaderProgressZoomLine}>
                  {String(n).padStart(2, '0')}
                </Text>
              </View>
            ) : (
              <ZoomAdaptiveText
                style={styles.infoReaderProgressText}
                zoomMaxLines={1}
                zoomTargetCharsPerLine={7}
                zoomMinScale={0.5}
                allowBaseScaleShrink={false}
                fitSingleLine
              >
                {`${String(index + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`}
              </ZoomAdaptiveText>
            )}
          </View>
        </View>
      </View>

      <View style={styles.infoReaderPagerBar}>
        <Pressable
          style={({ pressed }) => [
            styles.infoReaderNavBlock,
            styles.infoReaderNavBlockWide,
            styles.infoReaderNavActionBlockLeft,
            (!prevId || showTopicList) && styles.infoReaderNavBlockDisabled,
            prevId && !showTopicList && pressed && styles.infoActionPressed,
          ]}
          onPress={onPrev}
          disabled={!prevId || showTopicList}
        >
          <View style={styles.infoReaderNavActionStripLeft}>
            <RNText style={styles.infoReaderNavActionStripArrow}>‹</RNText>
          </View>
          <Text style={styles.infoReaderNavLabel}>{t(lang, 'info.pager.prev')}</Text>
          <View style={styles.infoReaderNavLabelDivider} />
          <ZoomAdaptiveText style={styles.infoReaderNavTopic} zoomMaxLines={2} zoomTargetCharsPerLine={16}>
            {prevId ? tInfoBlock(lang, prevId, 'title') : '-'}
          </ZoomAdaptiveText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.infoReaderNavBlock,
            styles.infoReaderNavBlockNarrow,
            styles.infoReaderNavActionBlockBottom,
            styles.infoReaderNavBlockCurrent,
            pressed && styles.infoActionPressed,
          ]}
          onPress={() => setShowTopicList((prev) => !prev)}
        >
          <Text style={styles.infoReaderNavLabel}>{t(lang, 'info.reader.topicList')}</Text>
          <View style={styles.infoReaderNavActionStripBottom}>
            <RNText style={styles.infoReaderNavActionStripArrowBottom}>∨</RNText>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.infoReaderNavBlock,
            styles.infoReaderNavBlockWide,
            styles.infoReaderNavActionBlockRight,
            (!nextId || showTopicList) && styles.infoReaderNavBlockDisabled,
            nextId && !showTopicList && pressed && styles.infoActionPressed,
          ]}
          onPress={onNext}
          disabled={!nextId || showTopicList}
        >
          <Text style={styles.infoReaderNavLabel}>{t(lang, 'info.pager.next')}</Text>
          <View style={styles.infoReaderNavLabelDivider} />
          <ZoomAdaptiveText style={styles.infoReaderNavTopic} zoomMaxLines={2} zoomTargetCharsPerLine={16}>
            {nextId ? tInfoBlock(lang, nextId, 'title') : '-'}
          </ZoomAdaptiveText>
          <View style={styles.infoReaderNavActionStrip}>
            <RNText style={styles.infoReaderNavActionStripArrow}>›</RNText>
          </View>
        </Pressable>
      </View>

      <ScrollView style={styles.infoReaderBody} contentContainerStyle={styles.infoReaderBodyContent} bounces={false}>
        {showTopicList ? (
          <>
            <Text style={styles.infoReaderListTitle}>{t(lang, 'info.reader.listTitle')}</Text>
            <Text style={styles.infoReaderListHint}>{t(lang, 'info.reader.listHint')}</Text>
            {topicIds.map((topicId, topicIndex) => (
              <Pressable
                key={topicId}
                style={({ pressed }) => [
                  styles.infoTopicListItem,
                  topicIndex === index && styles.infoTopicListItemActive,
                  pressed && styles.infoActionPressed,
                ]}
                onPress={() => {
                  onSelectTopic(topicIndex);
                  setShowTopicList(false);
                }}
              >
                <View style={styles.infoTopicListItemMain}>
                  <Text style={styles.infoTopicListItemOrder}>
                    {String(topicIndex + 1).padStart(2, '0')} / {String(topicIds.length).padStart(2, '0')}
                  </Text>
                  <ZoomAdaptiveText style={styles.infoTopicListItemTitle} zoomMaxLines={2} zoomTargetCharsPerLine={24}>
                    {tInfoBlock(lang, topicId, 'title')}
                  </ZoomAdaptiveText>
                </View>
                <View style={styles.infoReaderNavActionStrip}>
                  <RNText style={styles.infoReaderNavActionStripArrow}>›</RNText>
                </View>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <View style={styles.infoTopicRow}>
              <AppIcon name="book-open" size={22} />
              <Text style={styles.infoTopicTitle}>{page.title}</Text>
            </View>
            <Text style={styles.infoReaderIntro}>{page.intro}</Text>

            {page.sections.map((section) => (
              <View
                key={`${page.id}-${section.type}-${section.title}`}
                style={[
                  styles.infoReaderCard,
                  section.type === 'important' && styles.infoReaderCardImportant,
                  section.type === 'locate' && styles.infoReaderCardLocate,
                  section.type === 'tip' && styles.infoReaderCardTip,
                ]}
              >
                <Text style={styles.infoReaderCardTitle}>{section.title}</Text>
                <Text style={styles.infoReaderCardText}>{section.body}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PricingContent({
  lang,
  connector,
  currency,
}: {
  lang: LanguageCode;
  connector: TpConnector;
  currency: string;
}) {
  const mode = getConnectorAccessMode(connector);
  const graceTail =
    connector.publicPolicy.graceFrom === 'end'
      ? t(lang, 'pricing.graceFromEnd')
      : t(lang, 'pricing.graceFromStart');

  return (
    <View style={styles.overlayStack}>
      <Text style={styles.overlayText}>
        {t(lang, 'connector.kicker')} {devVar(lang, connector.parkingSpot, 'connector.parkingSpot')}
      </Text>
      <InfoLine icon="shield-alt" value={`${t(lang, 'access.mode')} ${mode}`} />
      <InfoLine icon="mobile-alt" value="AgeVolt app: ano" />
      <InfoLine icon="qrcode" value="QR/WebPay: ano" />
      <InfoLine icon="credit-card" value={`PoS terminal: ${connector.id === 'c1' ? 'ano' : 'nie'}`} />
      <Text style={styles.overlayHint}>
        <Text style={styles.overlayHintStrong}>i </Text>
        {t(lang, 'pricing.hint')}
      </Text>
      {connector.hasPublicPolicy ? (
        <>
          <InfoLine
            icon="bolt"
            value={`${t(lang, 'pricing.kwh')} ${devVar(
              lang,
              `${connector.publicPolicy.price.toFixed(2)} ${currency}`,
              'connector.publicPolicy.price'
            )}`}
          />
          <InfoLine
            icon="money-bill-alt"
            value={`${t(lang, 'pricing.session')} ${devVar(
              lang,
              `${connector.publicPolicy.sessionFee.toFixed(2)} ${currency}`,
              'connector.publicPolicy.sessionFee'
            )}`}
          />
          <InfoLine
            icon="car"
            value={`${t(lang, 'pricing.parking')} ${devVar(
              lang,
              `${connector.publicPolicy.parkingPerHour.toFixed(2)} ${currency}/h`,
              'connector.publicPolicy.parkingPerHour'
            )}`}
          />
          <InfoLine
            icon="clock"
            value={`${t(lang, 'pricing.grace')} ${devVar(
              lang,
              `${connector.publicPolicy.graceMinutes} ${t(lang, 'pricing.graceEnd')} (${graceTail})`,
              'connector.publicPolicy.graceMinutes'
            )}`}
          />
          <InfoLine
            icon="road"
            value={`${t(lang, 'pricing.occupy')} ${devVar(
              lang,
              `${connector.publicPolicy.occupyPerHour.toFixed(2)} ${currency}/h`,
              'connector.publicPolicy.occupyPerHour'
            )}`}
          />
        </>
      ) : (
        <Text style={styles.overlayHint}>
          Cennik sa urcuje po autorizacii karty / pouzivatela. Pri eRoaming karte cenu urcuje provider
          eRoaming sluzby.
        </Text>
      )}
    </View>
  );
}

function SpecsContent({ lang, connector }: { lang: LanguageCode; connector: TpConnector }) {
  const maxPowerKw = calculateMaxPowerKw(connector.powerType, connector.phases, connector.maxAmps);
  const plugTypeKey = getPlugTypeTranslationKey(connector.plugType);
  const plugTypeLabel = plugTypeKey ? t(lang, plugTypeKey) : connector.plugType;

  return (
    <View style={styles.overlayStack}>
      <Text style={styles.overlayText}>
        {t(lang, 'connector.kicker')} {devVar(lang, connector.parkingSpot, 'connector.parkingSpot')}
      </Text>
      <InfoLine icon="barcode" value={`FCID / EVSE ID: ${connector.evseCpoId}`} />
      <InfoLine icon="plug" value={`Konektor: ${plugTypeLabel}`} />
      <InfoLine icon="bolt" value={`Napajanie: ${connector.powerType}${connector.powerType === 'AC' ? connector.phases : ''}`} />
      <InfoLine icon="tachometer-alt" value={`Max vykon: ${maxPowerKw.toFixed(0)} kW`} />
      <InfoLine icon="unlock-alt" value="Unlock support: RFID / 6-miestny PIN" />
      <InfoLine icon="credit-card" value={`PoS support: ${connector.id === 'c1' ? 'ano' : 'nie'}`} />
    </View>
  );
}

function AccessContent({
  lang,
  connector,
  currency,
}: {
  lang: LanguageCode;
  connector: TpConnector;
  currency: string;
}) {
  const mode = getConnectorAccessMode(connector);
  const publicPrice = `${connector.publicPolicy.price.toFixed(2)} ${currency}/kWh`;

  return (
    <View style={styles.overlayStack}>
      <Text style={styles.overlayText}>
        {t(lang, 'connector.kicker')} {devVar(lang, connector.parkingSpot, 'connector.parkingSpot')}
      </Text>
      <InfoLine icon="shield-alt" value={`${t(lang, 'access.mode')} ${mode}`} />
      <InfoLine icon="users" value={`Private: ${yesNo(lang, connector.access.privateCharging)}`} />
      <InfoLine icon="globe-europe" value={`Public: ${yesNo(lang, connector.access.publicCharging)}`} />
      <InfoLine icon="exchange-alt" value={`eRoaming: ${yesNo(lang, connector.access.roamingCharging)}`} />
      <InfoLine
        icon="bolt"
        value={
          connector.hasPublicPolicy
            ? `Verejna cena: ${publicPrice}`
            : 'Verejny cennik nie je dostupny pre tento konektor'
        }
      />
      <InfoLine icon="mobile-alt" value="Platba: AgeVolt app + QR/WebPay" />
      <InfoLine icon="credit-card" value={`Platba kartou na PoS: ${connector.id === 'c1' ? 'ano' : 'nie'}`} />
      <Text style={styles.overlayHint}>
        Prilozte RFID kartu pre overenie konkretnej ceny (space/shared/user). Pri neznamej karte je mozne
        pokracovat ako eRoaming bez garancie ceny.
      </Text>
    </View>
  );
}

function SessionContent({
  lang,
  connector,
  onStop,
  onUnlock,
}: {
  lang: LanguageCode;
  connector: TpConnector;
  onStop: () => void;
  onUnlock: () => void;
}) {
  const canStop = Boolean(connector.activeTx) && connector.ocpp.status !== 'finishing';
  return (
    <View style={styles.overlayStack}>
      <Text style={styles.overlayText}>
        {`Session ${devVar(lang, connector.parkingSpot, 'connector.parkingSpot')}`}
      </Text>
      <InfoLine icon="tachometer-alt" value={`Aktualny vykon: ${connector.meter.power.toFixed(1)} kW`} />
      <InfoLine icon="battery-half" value={`Nabita energia: ${connector.meter.energy.toFixed(2)} kWh`} />
      <InfoLine
        icon="clock"
        value={`Cas nabijania: ${connector.activeTx?.chargingTime ?? '--:--:--'}`}
      />
      <InfoLine
        icon="euro-sign"
        value={`Cena doteraz: ${connector.activeTx ? `${connector.activeTx.costWithVat.toFixed(2)} EUR` : '-'}`}
      />
      <View style={styles.serviceFinalCard}>
        <Text style={styles.serviceFinalLabel}>Space name: AGV Shared Space</Text>
        <Text style={styles.serviceFinalLabel}>SPZ: BA123XY</Text>
        <Text style={styles.serviceFinalLabel}>RFID: overeny pouzivatel</Text>
      </View>
      <View style={styles.serviceFinalCard}>
        <Text style={styles.serviceFinalLabel}>Kredit: 56.90 EUR</Text>
        <Text style={styles.serviceFinalLabel}>Zostavajuci budget: 31.40 EUR</Text>
      </View>
      <Pressable style={styles.servicePinSubmit} onPress={onUnlock}>
        <Text style={styles.servicePinSubmitText}>Overit pouzivatela (RFID/PIN)</Text>
      </Pressable>
      <Pressable
        style={[styles.servicePinSubmit, !canStop && styles.connectorPrimaryCtaDisabled]}
        onPress={onStop}
        disabled={!canStop}
      >
        <Text style={[styles.servicePinSubmitText, !canStop && styles.connectorPrimaryCtaTextDisabled]}>
          {connector.ocpp.status === 'finishing' ? 'Ukoncovanie transakcie...' : 'Stop charging'}
        </Text>
      </Pressable>
    </View>
  );
}

function RfidPromptContent({
  mode,
  onSimulate,
}: {
  mode: AuthMode;
  onSimulate: (scanType: AuthScanType) => void;
}) {
  return (
    <View style={styles.overlayStack}>
      <Text style={styles.overlayText}>
        {mode === 'start' ? 'Prilozte kartu pre spustenie nabijania.' : 'Prilozte kartu pre odomknutie session.'}
      </Text>
      <Text style={styles.overlayHint}>Mock ovladanie pre demo flow:</Text>
      <Pressable style={styles.servicePinSubmit} onPress={() => onSimulate('known')}>
        <Text style={styles.servicePinSubmitText}>Simulovat znamu kartu</Text>
      </Pressable>
      <Pressable style={styles.servicePinSubmit} onPress={() => onSimulate('unknown')}>
        <Text style={styles.servicePinSubmitText}>Simulovat neznamu kartu</Text>
      </Pressable>
      <Pressable style={styles.servicePinSubmit} onPress={() => onSimulate('eroaming')}>
        <Text style={styles.servicePinSubmitText}>Simulovat eRoaming kartu</Text>
      </Pressable>
    </View>
  );
}

function StartConnectorPickContent({
  connectors,
  onSelect,
  onCancel,
}: {
  connectors: TpConnector[];
  onSelect: (connectorId: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.serviceMenuWrap}>
      <Text style={styles.overlayText}>Vyberte konektor pre start transakcie</Text>
      <View style={styles.serviceMenuItems}>
        {connectors.map((connector) => (
          <Pressable
            key={connector.id}
            style={({ pressed }) => [styles.serviceMenuItem, pressed && styles.infoActionPressed]}
            onPress={() => onSelect(connector.id)}
          >
            <View style={styles.serviceMenuItemMain}>
              <Text style={styles.serviceMenuItemText}>{connector.parkingSpot}</Text>
              <FitText style={styles.connectorBubbleValue} minScale={0.26} targetChars={16}>
                {connector.evseCpoId}
              </FitText>
            </View>
            <View style={styles.serviceMenuItemStrip}>
              <RNText style={styles.serviceMenuItemArrow}>›</RNText>
            </View>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.servicePinSubmit} onPress={onCancel}>
        <Text style={styles.servicePinSubmitText}>Zrusit</Text>
      </Pressable>
    </View>
  );
}

function RfidResultContent({
  mode,
  scanType,
  onContinue,
  onClose,
}: {
  mode: AuthMode;
  scanType: AuthScanType;
  onContinue: () => void;
  onClose: () => void;
}) {
  const eromingPartners = [
    'GreenWay',
    'Plugsurfing',
    'Shell Recharge',
    'ChargeMap',
    'Electromaps',
    'Virta',
    'EnBW',
    'Elli',
    'E.ON Drive',
    'Innogy',
    'Allego',
    'IONITY',
  ];
  if (scanType === 'known') {
    return (
      <View style={styles.overlayStack}>
        <Text style={styles.overlayText}>Karta je overena</Text>
        <InfoLine icon="id-card" value="Space name: AGV Shared Space" />
        <InfoLine icon="car" value="SPZ: BA123XY" />
        <InfoLine icon="tag" value={`Rezim: ${mode === 'start' ? 'Start nabijania' : 'Odomknutie session'}`} />
        <Pressable style={styles.servicePinSubmit} onPress={onContinue}>
          <Text style={styles.servicePinSubmitText}>Pokracovat</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.overlayStack}>
      <Text style={styles.overlayText}>Kartu v nasej sieti nepozname</Text>
      <Text style={styles.overlayHint}>
        Je mozne, ze ide o eRoaming kartu. Cenu urcuje dany EMP partner.
      </Text>
      <Text style={styles.overlayText}>Podporovani eRoaming partneri</Text>
      <ScrollView style={styles.eromingList} contentContainerStyle={styles.eromingListContent} bounces={false}>
        {eromingPartners.map((partner) => (
          <View key={partner} style={styles.eromingListItem}>
            <Text style={styles.eromingListText}>{partner}</Text>
          </View>
        ))}
      </ScrollView>
      <Pressable style={styles.servicePinSubmit} onPress={onContinue}>
        <Text style={styles.servicePinSubmitText}>Skusit pokracovat</Text>
      </Pressable>
      <Pressable style={styles.servicePinSubmit} onPress={onClose}>
        <Text style={styles.servicePinSubmitText}>Navrat</Text>
      </Pressable>
    </View>
  );
}

function calculateMaxPowerKw(
  powerType: 'AC' | 'DC',
  phases: 1 | 3,
  maxAmps: number
): number {
  if (powerType === 'DC') return maxAmps * 0.7;
  return (phases * 230 * maxAmps) / 1000;
}

const TEXT_SCALE = 1;
const ICON_SIZE = 34;
const TYPO = {
  large: Math.round(30 * TEXT_SCALE),
  medium: Math.round(24 * TEXT_SCALE),
  small: Math.round(18 * TEXT_SCALE),
  superLarge: Math.round(26 * 1.5 * TEXT_SCALE),
  // Backward-compatible aliases: only 3 real size tiers.
  display: Math.round(30 * TEXT_SCALE),
  title: Math.round(30 * TEXT_SCALE),
  body: Math.round(24 * TEXT_SCALE),
  meta: Math.round(18 * TEXT_SCALE),
};
const lh = (size: number, ratio = 1.2) => Math.round(size * ratio);

const styles = StyleSheet.create({
  appFrame: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  contentViewport: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  contentZoomLayer: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  homeNoScroll: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 10,
    gap: 8,
  },
  homeZoomScroll: {
    flex: 1,
    minHeight: 0,
  },
  homeZoomScrollContent: {
    gap: 8,
    paddingBottom: 16,
    flexGrow: 1,
  },
  stationShell: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    padding: 10,
    gap: 8,
  },
  stationHeader: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  stationHeaderWithBackStrip: {
    paddingLeft: 0,
    paddingRight: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  stationHeaderPressed: {
    opacity: 0.88,
  },
  stationBackStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 34,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  stationBackArrow: {
    color: '#ffffff',
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
  },
  stationTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  stationTitleRowWithBackStrip: {
    paddingLeft: 44,
  },
  stationTitleRowZoom: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 6,
  },
  stationTitleIconSlot: {
    width: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  stationTitleIconSlotZoom: {
    width: '100%',
    minWidth: 0,
    alignItems: 'flex-start',
  },
  stationName: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '900',
  },
  stationIdBlock: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  stationIdValue: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    color: '#000000',
    fontWeight: '800',
  },
  stationBody: {
    flex: 1,
    gap: 8,
    minHeight: 0,
  },
  header: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    height: 84,
    minHeight: 84,
    maxHeight: 84,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  headerThird: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  headerThirdLeft: {
    alignItems: 'flex-start',
  },
  headerThirdCenter: {
    alignItems: 'center',
  },
  headerThirdRight: {
    alignItems: 'flex-end',
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'flex-end',
    gap: 10,
  },
  ownerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  headerIconTypeKey: {
    fontSize: TYPO.meta,
    lineHeight: lh(TYPO.meta),
    color: '#000000',
    fontWeight: '700',
  },
  headerProviderName: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '800',
  },
  headerDateTime: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    color: '#000000',
    fontWeight: '800',
  },
  networkLine: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: '100%',
  },
  headerNetworkKey: {
    fontSize: TYPO.meta,
    lineHeight: lh(TYPO.meta),
    color: '#000000',
    fontWeight: '800',
  },
  headerIconPressTarget: {
    minHeight: 22,
    justifyContent: 'center',
  },
  ocppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 22,
  },
  ocppBadgeText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  logoBox: {
    borderWidth: 0,
    flex: 1,
    minWidth: 0,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoWordmark: {
    fontSize: TYPO.medium,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#000000',
  },
  topMagnifierButton: {
    width: 56,
    minWidth: 56,
    maxWidth: 56,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  topMagnifierButtonActive: {
    backgroundColor: '#000000',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 66,
    paddingVertical: 6,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    paddingRight: 44,
  },
  actionButtonZoom: {
    minHeight: 110,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 8,
  },
  actionIconSlot: {
    width: 42,
    minWidth: 42,
    maxWidth: 42,
    height: 42,
    minHeight: 42,
    maxHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconSlotZoom: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    height: 52,
    minHeight: 52,
    maxHeight: 52,
  },
  actionLabel: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '800',
    color: '#000000',
  },
  actionButtonStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  actionLabelZoom: {
    flex: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  connectorArea: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  connectorCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    padding: 12,
    justifyContent: 'flex-start',
  },
  connectorCardSingle: {
    maxWidth: '100%',
  },
  connectorCardOverview: {
    gap: 8,
    minHeight: 0,
  },
  connectorCardFocused: {
    gap: 8,
  },
  connectorIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  connectorIdentityRowFocused: {
    marginTop: 2,
    justifyContent: 'center',
  },
  connectorIdentityMainFocused: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectorIdentityMainWithSideArrow: {
    gap: 8,
  },
  connectorIdentityMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
  },
  connectorIdentityMainClickable: {
    borderWidth: 2.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flex: 1,
    justifyContent: 'flex-start',
  },
  connectorName: {
    fontSize: TYPO.superLarge,
    lineHeight: lh(TYPO.superLarge, 1.12),
    fontWeight: '900',
    color: '#000000',
  },
  connectorNameOverview: {
    fontSize: TYPO.superLarge * 1.72,
    lineHeight: lh(TYPO.superLarge * 1.72, 1.02),
    fontWeight: '900',
    color: '#000000',
  },
  connectorOverviewBody: {
    flex: 1,
    gap: 10,
    minHeight: 0,
  },
  connectorOverviewRow: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 86,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  connectorOverviewRowClickable: {
    overflow: 'hidden',
    paddingRight: 44,
  },
  connectorOverviewRowClickableLeft: {
    overflow: 'hidden',
    paddingLeft: 44,
  },
  connectorOverviewCellSplit: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
  },
  connectorOverviewCellFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 6,
    gap: 4,
  },
  connectorOverviewCellHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  connectorOverviewCellDivider: {
    height: 2,
    backgroundColor: '#000000',
    marginVertical: 3,
    opacity: 0.28,
  },
  connectorOverviewRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  connectorOverviewRowSplit: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
    minHeight: 86,
  },
  connectorOverviewRowHalf: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    flex: 1,
    minHeight: 86,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  connectorOverviewStatusBig: {
    fontSize: TYPO.superLarge * 2,
    lineHeight: lh(TYPO.superLarge * 2, 1.02),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewStatusInline: {
    fontSize: TYPO.superLarge * 1.55,
    lineHeight: lh(TYPO.superLarge * 1.55, 1.02),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    maxWidth: '100%',
  },
  connectorOverviewStatusWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
    paddingBottom: 4,
  },
  connectorOverviewStatusInlineLine: {
    fontSize: TYPO.superLarge * 1.55,
    lineHeight: lh(TYPO.superLarge * 1.55, 1.24),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    maxWidth: '100%',
    paddingBottom: 4,
  },
  connectorOverviewPowerTypeBig: {
    fontSize: TYPO.superLarge * 1.62,
    lineHeight: lh(TYPO.superLarge * 1.62, 1.02),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewPowerKwBig: {
    fontSize: TYPO.superLarge * 1.62,
    lineHeight: lh(TYPO.superLarge * 1.62, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewLiveKicker: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorMiniLabel: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorTxValue: {
    fontSize: TYPO.superLarge * 1.62,
    lineHeight: lh(TYPO.superLarge * 1.62, 1.02),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
    width: '100%',
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  connectorPrepareFlowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  connectorPrepareStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  connectorTimeRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  connectorTimeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  connectorTimeLabel: {
    fontSize: TYPO.title * 1.02,
    lineHeight: lh(TYPO.title * 1.02, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
  },
  connectorPrepareStatusMark: {
    fontSize: TYPO.superLarge * 1.95,
    lineHeight: lh(TYPO.superLarge * 1.95, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorPrepareValue: {
    fontSize: TYPO.title * 1.48,
    lineHeight: lh(TYPO.title * 1.48, 1),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewLiveValueBig: {
    fontSize: TYPO.superLarge * 1.62,
    lineHeight: lh(TYPO.superLarge * 1.62, 1.02),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  connectorOverviewLiveValueNumber: {
    fontSize: TYPO.superLarge * 1.52,
    lineHeight: lh(TYPO.superLarge * 1.52, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    width: '100%',
    minWidth: 0,
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  connectorOverviewLiveValueNumberFull: {
    fontSize: TYPO.superLarge * 1.75,
    lineHeight: lh(TYPO.superLarge * 1.75, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    width: '100%',
    minWidth: 0,
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  connectorOverviewUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  connectorOverviewUnitRowFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  connectorOverviewLiveUnitText: {
    fontSize: TYPO.title * 1.22,
    lineHeight: lh(TYPO.title * 1.22, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
  },
  connectorOverviewLiveUnitTextFull: {
    fontSize: TYPO.title * 1.42,
    lineHeight: lh(TYPO.title * 1.42, 1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    minWidth: 0,
  },
  connectorOverviewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  connectorOverviewPowerType: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    color: '#000000',
  },
  connectorOverviewStatus: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'right',
  },
  connectorOverviewLiveLabel: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    fontWeight: '700',
    color: '#000000',
  },
  connectorOverviewLiveValue: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.1),
    fontWeight: '900',
    color: '#000000',
  },
  connectorPowerBarTrack: {
    height: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  connectorPowerBarFill: {
    height: '100%',
    backgroundColor: '#000000',
  },
  connectorOverviewScale: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    fontWeight: '700',
    color: '#000000',
    textAlign: 'right',
  },
  connectorBubble: {
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  connectorBubbleZoom: {
    minHeight: 126,
    paddingVertical: 12,
    gap: 8,
  },
  connectorBubbleClickable: {
    borderStyle: 'solid',
    borderWidth: 3,
    overflow: 'hidden',
    paddingRight: 44,
  },
  connectorBubblePressed: {
    backgroundColor: '#f3f3f3',
  },
  connectorBubbleLabel: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    fontWeight: '700',
    color: '#000000',
  },
  connectorHeroStatus: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    color: '#000000',
  },
  connectorHeroLive: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    fontWeight: '700',
    color: '#000000',
  },
  connectorBubbleValue: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.15),
    fontWeight: '800',
    color: '#000000',
  },
  connectorTypeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  policyAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  policyAccessMark: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '900',
    color: '#000000',
  },
  connectorPlugTypeRow: {
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectorPlugTypeText: {
    flex: 1,
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
    color: '#000000',
  },
  connectorMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
  },
  accessBadge: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
  },
  accessBadgeText: {
    fontSize: TYPO.medium,
    fontWeight: '700',
    color: '#000000',
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    fontSize: TYPO.meta,
    color: '#000000',
    fontWeight: '700',
  },
  statusPanel: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 76,
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: TYPO.small,
    fontWeight: '700',
    color: '#000000',
    opacity: 0.72,
  },
  statusBig: {
    marginTop: 4,
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    color: '#000000',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 78,
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontSize: TYPO.small,
    fontWeight: '700',
    color: '#000000',
  },
  kpiValue: {
    marginTop: 2,
    fontSize: TYPO.meta,
    fontWeight: '800',
    color: '#000000',
  },
  clickableBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiClickableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  accessMoreCta: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
  },
  accessMoreCtaText: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    fontWeight: '800',
    color: '#000000',
  },
  connectorBubbleCtaRow: {
    marginTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: '#000000',
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  connectorBubbleCtaText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    fontWeight: '900',
    color: '#000000',
  },
  connectorBubbleActionStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorBubbleActionStripLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 34,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorBubbleActionStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
  },
  connectorQrButtonTextMobile: {
    fontSize: TYPO.superLarge * 1.42,
    lineHeight: lh(TYPO.superLarge * 1.42, 1.02),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
    maxWidth: '100%',
  },
  connectorOverviewMobileTextWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  connectorQrButtonTextMobileLine: {
    fontSize: TYPO.superLarge * 1.42,
    lineHeight: lh(TYPO.superLarge * 1.42, 1.02),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
    maxWidth: '100%',
  },
  connectorOverviewIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 48,
  },
  connectorPrimaryCta: {
    marginTop: 4,
    minHeight: 68,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  connectorPrimaryCtaDisabled: {
    marginTop: 4,
    minHeight: 68,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
  },
  connectorPrimaryCtaText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  connectorPrimaryCtaTextDisabled: {
    color: '#000000',
  },
  overlayWrap: {
    flex: 1,
    gap: 8,
    paddingBottom: 10,
  },
  overlaySecondaryRow: {
    width: '100%',
  },
  overlayHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    height: 66,
    minHeight: 66,
    maxHeight: 66,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  overlayHeaderZoom: {
    height: 98,
    minHeight: 98,
    maxHeight: 98,
    paddingVertical: 8,
  },
  overlayTitle: {
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
    color: '#000000',
  },
  overlayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlayTitleRowWithBack: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 2,
  },
  overlayHeaderBackSlot: {
    width: 132,
    minWidth: 132,
    maxWidth: 132,
    justifyContent: 'center',
  },
  overlayHeaderRightSpacer: {
    width: 132,
    minWidth: 132,
    maxWidth: 132,
  },
  overlayBackButton: {
    position: 'absolute',
    left: 12,
  },
  overlayBackButtonActionLeft: {
    overflow: 'hidden',
    paddingLeft: 34,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 10,
    minHeight: 46,
    height: 46,
    minWidth: 128,
    width: 128,
    maxWidth: 128,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  overlayBackButtonStripLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 28,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBackButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  overlayBackButtonText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
  },
  overlayTitleIconSlot: {
    width: 28,
    minWidth: 28,
    maxWidth: 28,
    height: 28,
    minHeight: 28,
    maxHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 10,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  closeText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1),
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  overlayCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 16,
    padding: 10,
    gap: 10,
  },
  overlayScrollView: {
    flex: 1,
  },
  overlayScrollContent: {
    gap: 8,
    paddingBottom: 16,
    flexGrow: 1,
  },
  overlayStack: {
    gap: 8,
  },
  overlayText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '700',
  },
  overlayHint: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    color: '#000000',
    fontWeight: '600',
  },
  overlayHintStrong: {
    fontWeight: '800',
  },
  serviceMenuWrap: {
    gap: 10,
  },
  serviceMenuItems: {
    gap: 10,
  },
  serviceMenuItem: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 74,
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingRight: 42,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  serviceMenuItemMain: {
    minHeight: 42,
    justifyContent: 'center',
  },
  serviceMenuItemText: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
  },
  serviceMenuItemStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 32,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceMenuItemArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  servicePinWrap: {
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  servicePinTitle: {
    color: '#000000',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
    textAlign: 'center',
  },
  servicePinBox: {
    width: 320,
    minHeight: 58,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  servicePinValue: {
    color: '#000000',
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  servicePinError: {
    color: '#000000',
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '900',
    borderWidth: 1.5,
    borderColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  serviceKeypad: {
    gap: 8,
    width: 320,
  },
  serviceKeypadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  serviceKey: {
    flex: 1,
    minHeight: 58,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  serviceKeyText: {
    color: '#000000',
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    fontWeight: '900',
  },
  servicePinSubmit: {
    width: 320,
    minHeight: 56,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  servicePinSubmitText: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '900',
  },
  serviceFinalWrap: {
    gap: 12,
  },
  serviceFinalTitle: {
    color: '#000000',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  serviceFinalCard: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  serviceFinalLabel: {
    color: '#000000',
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '700',
  },
  serviceFinalHint: {
    color: '#000000',
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    fontWeight: '700',
  },
  eromingList: {
    maxHeight: 260,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
  },
  eromingListContent: {
    padding: 8,
    gap: 6,
  },
  eromingListItem: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  eromingListText: {
    color: '#000000',
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    fontWeight: '800',
  },
  languageRow: {
    gap: 10,
  },
  languageButton: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingRight: 42,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  languageButtonActive: {
    backgroundColor: '#f4f4f4',
  },
  languageButtonMain: {
    minHeight: 42,
    justifyContent: 'center',
  },
  languageButtonText: {
    color: '#000000',
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    fontWeight: '800',
    textAlign: 'left',
  },
  languageButtonTextActive: {
    fontWeight: '900',
  },
  languageButtonStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  infoLine: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  infoLineText: {
    color: '#000000',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '700',
  },
  infoReaderWrap: {
    flex: 1,
    gap: 8,
  },
  infoReaderHeader: {
    minHeight: 72,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoReaderHeaderZoom: {
    minHeight: 144,
    paddingVertical: 10,
  },
  infoReaderHeaderSideSlot: {
    width: 143,
    minWidth: 143,
    maxWidth: 143,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  infoReaderHeaderSideSlotZoom: {
    width: 164,
    minWidth: 164,
    maxWidth: 164,
  },
  infoBackButton: {
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBackButtonActionLeft: {
    overflow: 'hidden',
    paddingLeft: 38,
    borderWidth: 3,
    width: 143,
    minWidth: 143,
    maxWidth: 143,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
  },
  infoBackButtonActionLeftZoom: {
    paddingLeft: 34,
    paddingRight: 6,
    width: 164,
    minWidth: 164,
    maxWidth: 164,
  },
  infoBackButtonText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
  },
  infoBackButtonTextZoom: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
  },
  infoBackButtonStripLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBackButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  infoReaderHeaderTitle: {
    flex: 1,
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
  },
  infoReaderHeaderTitleZoom: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.05),
  },
  infoReaderProgressBox: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    width: 143,
    minWidth: 143,
    maxWidth: 143,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoReaderProgressBoxZoom: {
    width: 164,
    minWidth: 164,
    maxWidth: 164,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  infoReaderProgressText: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  infoReaderProgressZoomWrap: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  infoReaderProgressZoomLine: {
    width: '100%',
    textAlign: 'center',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1.02),
    color: '#000000',
    fontWeight: '900',
  },
  infoReaderHeaderControlZoom: {
    height: 124,
    minHeight: 124,
    maxHeight: 124,
  },
  infoReaderPagerBar: {
    minHeight: 82,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 14,
    padding: 8,
    flexDirection: 'row',
    gap: 8,
  },
  infoReaderNavBlock: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'flex-start',
    gap: 4,
    minHeight: 66,
  },
  infoReaderNavBlockWide: {
    flex: 1.15,
  },
  infoReaderNavBlockNarrow: {
    flex: 0.85,
  },
  infoReaderNavActionBlockLeft: {
    overflow: 'hidden',
    paddingLeft: 36,
    borderWidth: 3,
  },
  infoReaderNavActionBlockRight: {
    overflow: 'hidden',
    paddingRight: 36,
    borderWidth: 3,
  },
  infoReaderNavActionBlockBottom: {
    overflow: 'hidden',
    paddingBottom: 34,
    borderWidth: 3,
  },
  infoReaderNavBlockCurrent: {
    backgroundColor: '#f7f7f7',
  },
  infoReaderNavBlockDisabled: {
    opacity: 0.45,
  },
  infoReaderNavLabel: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '900',
    textAlign: 'center',
  },
  infoReaderNavLabelDivider: {
    height: 1.5,
    backgroundColor: '#000000',
    opacity: 0.5,
  },
  infoReaderNavTopic: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small, 1.15),
    color: '#000000',
    fontWeight: '600',
    textAlign: 'center',
  },
  infoReaderNavActionStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoReaderNavActionStripLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoReaderNavActionStripBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 30,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoReaderNavActionStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  infoReaderNavActionStripArrowBottom: {
    color: '#ffffff',
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1),
    fontWeight: '900',
    marginBottom: 1,
  },
  infoActionPressed: {
    backgroundColor: '#f2f2f2',
  },
  infoReaderBody: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 14,
  },
  infoReaderBodyContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 18,
  },
  infoReaderListTitle: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '900',
  },
  infoReaderListHint: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.25),
    color: '#000000',
    fontWeight: '600',
    marginBottom: 4,
  },
  infoTopicListItem: {
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 12,
    minHeight: 84,
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingRight: 42,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  infoTopicListItemActive: {
    backgroundColor: '#f7f7f7',
  },
  infoTopicListItemMain: {
    gap: 4,
  },
  infoTopicListItemOrder: {
    fontSize: TYPO.small,
    lineHeight: lh(TYPO.small),
    color: '#000000',
    fontWeight: '900',
  },
  infoTopicListItemTitle: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.15),
    color: '#000000',
    fontWeight: '800',
  },
  infoReaderIntro: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.3),
    color: '#000000',
    fontWeight: '600',
  },
  infoReaderCard: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  infoReaderCardImportant: {
    borderWidth: 2.2,
  },
  infoReaderCardLocate: {
    borderStyle: 'dashed',
  },
  infoReaderCardTip: {
    borderWidth: 2,
  },
  infoReaderCardTitle: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    color: '#000000',
    fontWeight: '900',
  },
  infoReaderCardText: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.3),
    color: '#000000',
    fontWeight: '600',
  },
  infoPagerWrap: {
    flex: 1,
    gap: 14,
  },
  infoPagerCounter: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    color: '#000000',
    fontWeight: '800',
  },
  infoTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoTopicTitle: {
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
    color: '#000000',
    fontWeight: '900',
    flex: 1,
  },
  infoTopicBody: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.3),
    color: '#000000',
    fontWeight: '600',
  },
  infoNavRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  infoNavCol: {
    flex: 1,
    gap: 8,
  },
  pagerButton: {
    flex: 1,
    borderWidth: 3,
    borderColor: '#000000',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    height: 96,
    minHeight: 96,
    maxHeight: 96,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
    paddingRight: 42,
    overflow: 'hidden',
  },
  pagerButtonText: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  pagerButtonStrip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 32,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerButtonStripArrow: {
    color: '#ffffff',
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    fontWeight: '900',
  },
  infoNavTopic: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    color: '#000000',
    fontWeight: '600',
    textAlign: 'center',
  },
  infoNavTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: lh(TYPO.medium, 1.25) * 3 + 2,
  },
  supportWrap: {
    gap: 14,
  },
  supportIntro: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1.3),
    color: '#000000',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  supportBody: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body, 1.35),
    color: '#000000',
    fontWeight: '700',
  },
  supportFootnote: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    color: '#000000',
    opacity: 0.85,
    fontWeight: '700',
  },
  supportAppsHeading: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title, 1.3),
    color: '#000000',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  supportCards: {
    gap: 10,
  },
  supportInfoCard: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  supportInfoTitle: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large),
    color: '#000000',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  supportInfoItem: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium),
    color: '#000000',
    fontWeight: '600',
  },
  supportInfoItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportRow: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  supportRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  supportRowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  supportRowTitle: {
    fontSize: TYPO.title,
    lineHeight: lh(TYPO.title),
    color: '#000000',
    fontWeight: '800',
  },
  supportRowTitleStrong: {
    fontSize: TYPO.display,
    lineHeight: lh(TYPO.display),
  },
  supportRowSubtitle: {
    fontSize: TYPO.medium,
    lineHeight: lh(TYPO.medium, 1.25),
    color: '#000000',
    fontWeight: '700',
    opacity: 0.8,
  },
  supportQrButton: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    minWidth: 86,
    minHeight: 48,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  supportQrButtonText: {
    fontSize: TYPO.body,
    lineHeight: lh(TYPO.body),
    color: '#000000',
    fontWeight: '800',
  },
  qrWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    gap: 12,
  },
  qrImage: {
    width: 320,
    height: 320,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  qrHint: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.1),
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
  },
  qrValue: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.1),
    color: '#000000',
    fontWeight: '700',
    textAlign: 'center',
  },
  qrPaymentWrap: {
    width: '100%',
    maxWidth: 680,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: '#ffffff',
  },
  qrPaymentTitle: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.1),
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },
  qrPaymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  qrPaymentChip: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
  },
  qrPaymentChipText: {
    fontSize: TYPO.large,
    lineHeight: lh(TYPO.large, 1.05),
    fontWeight: '800',
    color: '#000000',
  },
});
