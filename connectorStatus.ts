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
  suspended: 'connector.overviewStatus.suspended',
  finishing: 'connector.overviewStatus.finishing',
  faultedWithTransa: 'connector.overviewStatus.faultedWithTransa',
  faultedWithoutTransa: 'connector.overviewStatus.faultedWithoutTransa',
  faulted: 'connector.overviewStatus.faulted',
};

const ACTIVE_TX_STATUSES = new Set<ConnectorStatus>([
  'connectEV',
  'preparing',
  'charging',
  'suspendedEV',
  'suspendedEVSE',
  'suspended',
  'faultedWithTransa',
  'finishing',
]);

export const MOCK_CONNECTOR_STATUS_CYCLE: ConnectorStatus[] = [
  'available',
  'EVconnected',
  'connectEV',
  'preparing',
  'charging',
  'suspendedEV',
  'suspendedEVSE',
  'suspended',
  'finishing',
  'disconnectEV',
  'faultedWithTransa',
  'faultedWithoutTransa',
  'faulted',
];

export function getConnectorOverviewStatusLabel(lang: LanguageCode, status: ConnectorStatus): string {
  return t(lang, OVERVIEW_STATUS_KEYS[status]);
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
  return status === 'suspendedEVSE' || status === 'suspended';
}

export function isFaultWithTransactionStatus(status: ConnectorStatus): boolean {
  return status === 'faultedWithTransa';
}

export function isFaultWithoutTransactionStatus(status: ConnectorStatus): boolean {
  return status === 'faultedWithoutTransa' || status === 'faulted';
}

export function isConnectorSessionVehicleBubbleStatus(status: ConnectorStatus): boolean {
  return ACTIVE_TX_STATUSES.has(status) && status !== 'finishing';
}
