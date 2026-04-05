import type {TFunction} from 'i18next';
import type {
  EvmRuntimeState,
  MeterRuntimeState,
} from '../../../services/tpVariables/types';

/** Kľúče prekladu stavu komunikácie elektromera (zodpovedá MeterRuntimeState). */
const METER_STATE_I18N_KEY: Record<MeterRuntimeState, string> = {
  AVAILABLE: 'connectorsConfig.meterStateAvailable',
  COM_ERR: 'connectorsConfig.meterStateComErr',
  UNAVAILABLE: 'connectorsConfig.meterStateUnavailable',
};

/** Kľúče prekladu stavu komunikácie EV modulu (zodpovedá EvmRuntimeState). */
const EVM_STATE_I18N_KEY: Record<EvmRuntimeState, string> = {
  AVAILABLE: 'connectorsConfig.evmStateAvailable',
  COM_ERR: 'connectorsConfig.evmStateComErr',
  INIT: 'connectorsConfig.evmStateInit',
  FW_UPDATE: 'connectorsConfig.evmStateFwUpdate',
  MANUAL: 'connectorsConfig.evmStateManual',
};

/**
 * Formátuje uloženú energiu vo Wh na reťazec kWh.
 */
export const formatTotalEnergyFromWh = (energyWh: number): string => {
  const kwh = energyWh / 1000;
  return `${kwh.toFixed(3)} kWh`;
};

/**
 * Formátuje tri fázové hodnoty na jeden riadok (napr. napätia).
 */
export const formatTripleNumeric = (
  values: number[],
  fractionDigits: number,
): string => {
  const a = values[0] ?? 0;
  const b = values[1] ?? 0;
  const c = values[2] ?? 0;
  return `${a.toFixed(fractionDigits)} / ${b.toFixed(fractionDigits)} / ${c.toFixed(fractionDigits)}`;
};

/**
 * Vráti lokalizovaný popis stavu komunikácie s elektromerom.
 */
export const translateMeterCommState = (
  t: TFunction,
  state: MeterRuntimeState,
): string => t(METER_STATE_I18N_KEY[state]);

/**
 * Vráti lokalizovaný popis stavu komunikácie s EV modulom (runtime).
 */
export const translateEvmCommState = (
  t: TFunction,
  state: EvmRuntimeState,
): string => t(EVM_STATE_I18N_KEY[state]);
