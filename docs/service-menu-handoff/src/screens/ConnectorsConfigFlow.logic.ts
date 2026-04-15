/**
 * Simplified connector config flow extracted from useConnectorsConfig.ts.
 */
export const connectorsConfigAlgorithm = [
  'ensure modbus initialized',
  'suspend meter polling on RS-485',
  'wait bus settle delay',
  'for each connector send FC 0x41 / CMD 72',
  'parse payload into ConnectorsConfigData',
  'read CP voltage and live meter data',
  'resume polling',
] as const;

export const importantOperationalNote =
  'Do not poll energy meter while reading EV module config. EVM firmware becomes unstable on shared RS-485 traffic.';
