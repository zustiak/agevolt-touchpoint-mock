import { isRfidStationModalStartableStatus, isTxActiveStatus } from './connectorStatus';
import type {
  ConnectorRfidAccountPolicy,
  MockAccount,
  MockRfidCard,
  MockSpace,
  MockVehicle,
  StationCardSnapshot,
  StationConnectorDecision,
} from './rfidStationTypes';

/** Priestory s rolou Admin/Owner; ak mock nemá pole `spaces`, jeden fallback priestor. */
export function getSpacesForStationAccount(account: MockAccount, fallbackSpaceName: string): MockSpace[] {
  if (account.spaces?.length) return account.spaces;
  return [{ id: 'sp-fallback', name: fallbackSpaceName, role: 'owner' }];
}

type StationConnectorLike = {
  id: string;
  parkingSpot: string;
  access: {
    roamingCharging: boolean;
  };
  hasEroamingHubject?: boolean;
  publicPolicy?: {
    price?: number;
  };
  ocpp: {
    status: StationConnectorDecision['status'];
  };
  activeTx: {
    /** Číslo / id transakcie (mock). */
    id?: string;
    linkedCardUid?: string | null;
    /** RFID tag ktorý TX spustil. */
    rfidTag?: string | null;
    /** Nadradený tag (pool) priradený k TX. */
    parentTag?: string | null;
    costWithVat?: number | null;
  } | null;
  rfidAccountPolicies?: ConnectorRfidAccountPolicy[];
};

export function findRfidAccountByCredentials(
  accounts: readonly MockAccount[],
  login: string,
  password: string
): MockAccount | null {
  const normalizedLogin = login.trim().toLowerCase();
  return (
    accounts.find(
      (account) =>
        account.login.trim().toLowerCase() === normalizedLogin && account.password === password
    ) ?? null
  );
}

export function getStationCardSnapshot(
  uid: string,
  cards: readonly MockRfidCard[],
  accounts: readonly MockAccount[],
  /** Fallback z `mock-config` ak runtime `cards` nemá záznam (HMR / starý state) alebo chýbajú polia (`blocked`). */
  configCards?: readonly MockRfidCard[]
): StationCardSnapshot {
  const fromRuntime = cards.find((item) => item.uid === uid) ?? null;
  const fromConfig = configCards?.find((item) => item.uid === uid) ?? null;
  /** Runtime má prednosť (napr. po „Pridať kartu“); inak platí záznam z JSON. */
  const card = fromRuntime ?? fromConfig;
  const configCard = fromConfig;
  if (!card || !card.known) {
    return {
      uid,
      known: false,
      blocked: false,
      card,
      cardParentTag: null,
      account: null,
      vehicle: null,
      driverName: null,
      driverEmail: null,
    };
  }

  const account = card.accountId ? accounts.find((item) => item.id === card.accountId) ?? null : null;
  const vehicle =
    account && card.vehicleId ? account.vehicles.find((item) => item.id === card.vehicleId) ?? null : null;

  const blocked = card.blocked === true || configCard?.blocked === true;

  const parentFromCard = card.parentTag ?? configCard?.parentTag ?? null;
  const cardParentTag =
    typeof parentFromCard === 'string' && parentFromCard.trim().length > 0 ? parentFromCard.trim() : null;

  return {
    uid,
    known: true,
    blocked,
    card,
    cardParentTag,
    account,
    vehicle,
    driverName: account?.driverName ?? null,
    driverEmail: account?.driverEmail ?? null,
  };
}

export function findVehicleById(
  account: MockAccount | null,
  vehicleId: string | null | undefined
): MockVehicle | null {
  if (!account || !vehicleId) return null;
  return account.vehicles.find((item) => item.id === vehicleId) ?? null;
}

function getConnectorPolicy(
  connector: StationConnectorLike,
  accountId: string | null | undefined
): ConnectorRfidAccountPolicy | null {
  if (!accountId) return null;
  return connector.rfidAccountPolicies?.find((item) => item.accountId === accountId) ?? null;
}

function formatPriceLabel(
  priceLabel: string | null | undefined,
  pricePerKwh: number | null | undefined,
  currency: string,
  fallbackPublicPrice: number | null | undefined
): string | null {
  if (priceLabel) return priceLabel;
  if (typeof pricePerKwh === 'number') return `${pricePerKwh.toFixed(2)} ${currency}/kWh`;
  if (typeof fallbackPublicPrice === 'number') return `${fallbackPublicPrice.toFixed(2)} ${currency}/kWh`;
  return null;
}

function formatTxTotalCostLabel(connector: StationConnectorLike, currency: string): string | null {
  const tx = connector.activeTx;
  if (!tx || typeof tx.costWithVat !== 'number' || tx.costWithVat <= 0) return null;
  return `${tx.costWithVat.toFixed(2)} ${currency}`;
}

/** Skúškovací tag alebo parent tag karty sa zhoduje s tagom / parent tagom TX (alebo legacy `linkedCardUid`). */
export function isTxAuthorizedForRfidUid(
  tx: StationConnectorLike['activeTx'],
  scannedUid: string,
  cardParentTag: string | null
): boolean {
  if (!tx) return false;
  const n = (s: string | null | undefined) => (s ?? '').trim();
  const matchesId = (id: string) => {
    if (!id) return false;
    return (
      n(tx.rfidTag) === id ||
      n(tx.parentTag) === id ||
      n(tx.linkedCardUid) === id
    );
  };
  const u = scannedUid.trim();
  if (matchesId(u)) return true;
  const p = cardParentTag?.trim();
  if (p && matchesId(p)) return true;
  return false;
}

export function buildStationConnectorDecision(
  connector: StationConnectorLike,
  snapshot: StationCardSnapshot,
  currency: string
): StationConnectorDecision {
  const status = connector.ocpp.status;
  const txActive = isTxActiveStatus(status);
  const policy = getConnectorPolicy(connector, snapshot.account?.id);
  const cardParentTag = snapshot.cardParentTag ?? null;
  const scannedUid = snapshot.uid;
  const startable = isRfidStationModalStartableStatus(status);

  if (status === 'faultedWithoutTransa') {
    return {
      connectorId: connector.id,
      parkingSpot: connector.parkingSpot,
      status,
      txActive: false,
      linkedActiveTx: false,
      canMoreInfo: true,
      canStop: false,
      canStart: false,
      canStartRoaming: false,
      noAction: true,
      accessMode: null,
      priceLabel: null,
      pricePerKwh: null,
      denyReasonKey: 'rfid.station.noActionFault',
      txTotalCostLabel: null,
    };
  }

  if (txActive) {
    const authorized = isTxAuthorizedForRfidUid(connector.activeTx, scannedUid, cardParentTag);
    const txTotalCostLabel = authorized ? formatTxTotalCostLabel(connector, currency) : null;
    return {
      connectorId: connector.id,
      parkingSpot: connector.parkingSpot,
      status,
      txActive: true,
      linkedActiveTx: authorized,
      canMoreInfo: true,
      canStop: authorized,
      canStart: false,
      canStartRoaming: false,
      noAction: !authorized,
      accessMode: null,
      priceLabel: null,
      pricePerKwh: null,
      denyReasonKey: authorized ? null : 'rfid.station.txOtherCard',
      txTotalCostLabel,
    };
  }

  /** Blokovaná karta: na voľnom konektore žiadny štart; ak už beží autorizovaná TX, vyššie platí stop/suma. */
  if (snapshot.known && snapshot.blocked) {
    return {
      connectorId: connector.id,
      parkingSpot: connector.parkingSpot,
      status,
      txActive: false,
      linkedActiveTx: false,
      canMoreInfo: true,
      canStop: false,
      canStart: false,
      canStartRoaming: false,
      noAction: true,
      accessMode: null,
      priceLabel: null,
      pricePerKwh: null,
      denyReasonKey: null,
      txTotalCostLabel: null,
    };
  }

  if (snapshot.known) {
    if (!policy) {
      return {
        connectorId: connector.id,
        parkingSpot: connector.parkingSpot,
        status,
        txActive: false,
        linkedActiveTx: false,
        canMoreInfo: true,
        canStop: false,
        canStart: false,
        canStartRoaming: false,
        noAction: true,
        accessMode: null,
        priceLabel: null,
        pricePerKwh: null,
        denyReasonKey: 'rfid.station.deniedNoPolicy',
        txTotalCostLabel: null,
      };
    }

    if (!policy.allowedStart) {
      return {
        connectorId: connector.id,
        parkingSpot: connector.parkingSpot,
        status,
        txActive: false,
        linkedActiveTx: false,
        canMoreInfo: true,
        canStop: false,
        canStart: false,
        canStartRoaming: false,
        noAction: true,
        accessMode: policy.accessMode,
        priceLabel: formatPriceLabel(
          policy.priceLabel,
          policy.pricePerKwh,
          currency,
          connector.publicPolicy?.price ?? null
        ),
        pricePerKwh: policy.pricePerKwh ?? null,
        denyReasonKey: policy.denyReasonKey ?? 'rfid.station.deniedByPolicy',
        txTotalCostLabel: null,
      };
    }

    const canStart = policy.allowedStart && startable;
    return {
      connectorId: connector.id,
      parkingSpot: connector.parkingSpot,
      status,
      txActive: false,
      linkedActiveTx: false,
      canMoreInfo: true,
      canStop: false,
      canStart,
      canStartRoaming: false,
      noAction: !canStart,
      accessMode: policy.accessMode,
      priceLabel: formatPriceLabel(
        policy.priceLabel,
        policy.pricePerKwh,
        currency,
        connector.publicPolicy?.price ?? null
      ),
      pricePerKwh: policy.pricePerKwh ?? null,
      denyReasonKey: null,
      txTotalCostLabel: null,
    };
  }

  const roamingHub = connector.access.roamingCharging && connector.hasEroamingHubject === true;
  const canStartRoaming = roamingHub && startable;
  return {
    connectorId: connector.id,
    parkingSpot: connector.parkingSpot,
    status,
    txActive: false,
    linkedActiveTx: false,
    canMoreInfo: true,
    canStop: false,
    canStart: false,
    canStartRoaming,
    noAction: !canStartRoaming,
    accessMode: canStartRoaming ? 'eroaming' : null,
    priceLabel: null,
    pricePerKwh: null,
    denyReasonKey: canStartRoaming ? null : 'rfid.station.unknownNeedsAccount',
    txTotalCostLabel: null,
  };
}
