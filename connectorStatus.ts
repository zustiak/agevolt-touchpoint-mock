import type { ConnectorStatus, LanguageCode } from './i18n';
import { t } from './i18n';

const OVERVIEW_STATUS_KEYS: Record<ConnectorStatus, string> = {
  available: 'connector.overviewStatus.available',
  EVconnected: 'connector.overviewStatus.EVconnected',
  connectEV: 'connector.overviewStatus.connectEV',
  preparing: 'connector.overviewStatus.preparing',
  charging: 'connector.overviewStatus.charging',
  suspendedEV: 'connector.overviewStatus.suspendedEV',
  suspendedEVSE: 'connector.overviewStatus.suspendedEVSE',
  disconnectEV: 'connector.overviewStatus.disconnectEV',
  faultedWithTransa: 'connector.overviewStatus.faultedWithTransa',
  faultedWithoutTransa: 'connector.overviewStatus.faultedWithoutTransa',
};

const VALID_CONNECTOR_STATUSES = new Set<string>(Object.keys(OVERVIEW_STATUS_KEYS));

const ACTIVE_TX_STATUSES = new Set<ConnectorStatus>([
  'connectEV',
  'preparing',
  'charging',
  'suspendedEV',
  'suspendedEVSE',
  'faultedWithTransa',
]);

export const MOCK_CONNECTOR_STATUS_CYCLE: ConnectorStatus[] = [
  'available',
  'EVconnected',
  'connectEV',
  'preparing',
  'charging',
  'suspendedEV',
  'suspendedEVSE',
  'disconnectEV',
  'faultedWithTransa',
  'faultedWithoutTransa',
];

export function getConnectorOverviewStatusLabel(lang: LanguageCode, status: ConnectorStatus): string {
  return t(lang, OVERVIEW_STATUS_KEYS[status]);
}

/** Legacy strings (removed states) and unknown values → safe runtime status. */
export function normalizeConnectorStatus(raw: string | null | undefined): ConnectorStatus {
  if (raw == null || raw === 'finishing') return 'available';
  if (raw === 'suspended') return 'suspendedEVSE';
  if (raw === 'faulted') return 'faultedWithoutTransa';
  if (VALID_CONNECTOR_STATUSES.has(raw)) return raw as ConnectorStatus;
  return 'available';
}

export function nextMockConnectorStatus(current: ConnectorStatus): ConnectorStatus {
  const cur = normalizeConnectorStatus(current);
  let idx = MOCK_CONNECTOR_STATUS_CYCLE.indexOf(cur);
  if (idx < 0) idx = 0;
  const len = MOCK_CONNECTOR_STATUS_CYCLE.length;
  const nextIdx = (idx + 1) % len;
  return MOCK_CONNECTOR_STATUS_CYCLE[nextIdx];
}

export function isTxActiveStatus(status: ConnectorStatus): boolean {
  return ACTIVE_TX_STATUSES.has(status);
}

export function isConnectCountdownStatus(status: ConnectorStatus): boolean {
  return status === 'connectEV';
}

export function isFinishedByVehicleStatus(status: ConnectorStatus): boolean {
  return status === 'suspendedEV';
}

export function isBlockedByStationStatus(status: ConnectorStatus): boolean {
  return status === 'suspendedEVSE';
}

export function isFaultWithTransactionStatus(status: ConnectorStatus): boolean {
  return status === 'faultedWithTransa';
}

export function isFaultWithoutTransactionStatus(status: ConnectorStatus): boolean {
  return status === 'faultedWithoutTransa';
}

export function isConnectorSessionVehicleBubbleStatus(status: ConnectorStatus): boolean {
  return ACTIVE_TX_STATUSES.has(status);
}

/**
 * Stavy konektora, v ktorých je v RFID modáli stanice povolený **Štart**.
 * Povolené len pre idle stavy (Voľný, Vozidlo pripojené), nie pre summary po ukončení TX.
 */
export const RFID_STATION_MODAL_STARTABLE_STATUSES = new Set<ConnectorStatus>([
  'available',
  'EVconnected',
]);

export function isRfidStationModalStartableStatus(status: ConnectorStatus): boolean {
  return RFID_STATION_MODAL_STARTABLE_STATUSES.has(normalizeConnectorStatus(status));
}
