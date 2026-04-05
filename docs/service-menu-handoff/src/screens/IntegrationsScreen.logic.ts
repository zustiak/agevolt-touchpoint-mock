/**
 * Extracted behavior from Settings/Integrations/tpClient.tsx.
 * New project should keep these actions explicit.
 */
export interface IntegrationsForm {
  ocppUrl: string;
  ocppPort: string;
  ocppPath: string;
  sampleInterval: string;
  vendor: string;
  model: string;
  stationSerialNumber: string;
  maxCurrent: string;
  meter1: string;
  evm1: string;
  meter2: string;
  evm2: string;
}

export const normalizeIntegrationsForm = (form: IntegrationsForm) => ({
  ocppUrl: form.ocppUrl.trim(),
  ocppPort: Number(form.ocppPort),
  ocppPath: form.ocppPath.trim(),
  sampleInterval: Number(form.sampleInterval),
  vendor: form.vendor.trim(),
  model: form.model.trim(),
  stationSerialNumber: form.stationSerialNumber.trim(),
  maxCurrent: Number(form.maxCurrent),
  modbusAddresses: {
    meter1: Number(form.meter1),
    evm1: Number(form.evm1),
    meter2: Number(form.meter2),
    evm2: Number(form.evm2),
  },
});

export const integrationsQuickActions = {
  save: 'Persist OCPP/Modbus/CSMS fields into config + runtime state',
  connectOcpp: 'Connect websocket client and mark touchpoint configured',
  disconnectOcpp: 'Disconnect websocket client',
  connectModbus: 'Initialize RS-485 with addresses and dualPort',
  disconnectModbus: 'Shutdown RS-485',
  connectMqtt: 'Connect MQTT client',
  disconnectMqtt: 'Disconnect MQTT client',
  openFirmwareUpdate: 'Navigate to firmware update screen',
  openConnectorsConfig: 'Navigate to connector configuration screen',
} as const;
