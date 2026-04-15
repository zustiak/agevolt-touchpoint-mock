/** Predvolený port pri neúplnej URL (host bez schémy) – zladené s UI v tpClient. */
export const TP_CLIENT_FALLBACK_OCPP_PORT = '9000';

const WS_PREFIX = 'ws://';
const WSS_PREFIX = 'wss://';

/** Skontroluje, či reťazec vyzerá ako základná ws(s) URL (ako z init OCPP bloku). */
export const isFullOcppWsBaseUrl = (raw: string): boolean => {
  const t = raw.trim();
  return t.startsWith(WS_PREFIX) || t.startsWith(WSS_PREFIX);
};

const DEFAULT_PORT_WSS = '443';
const DEFAULT_PORT_WS = '80';

export type OcppConnectionFieldsForUi = {
  urlField: string;
  portField: string;
  pathField: string;
};

/**
 * Zmapuje SSOT pre OCPP pripojenie (init / tp.url + mainSlice) na tri polia formulára.
 * Pri plnej ws(s) URL zobrazí celý reťazec v prvom poli a vyplní port a cestu z URL.
 */
export const deriveOcppConnectionFieldsForUi = (
  tpOcppUrl: string | null | undefined,
  mainAddress: string,
  mainPort: number | undefined,
  mainPath: string | undefined,
): OcppConnectionFieldsForUi => {
  const trimmedMainPath = (mainPath ?? '').trim();
  const rawBase = (tpOcppUrl ?? mainAddress ?? '').trim();

  if (rawBase.length === 0) {
    return {
      urlField: '',
      portField:
        mainPort != null && mainPort > 0
          ? String(mainPort)
          : TP_CLIENT_FALLBACK_OCPP_PORT,
      pathField: trimmedMainPath,
    };
  }

  const isFullUrl =
    rawBase.startsWith(WS_PREFIX) || rawBase.startsWith(WSS_PREFIX);

  if (!isFullUrl) {
    return {
      urlField: rawBase,
      portField:
        mainPort != null && mainPort > 0
          ? String(mainPort)
          : TP_CLIENT_FALLBACK_OCPP_PORT,
      pathField: trimmedMainPath,
    };
  }

  try {
    const parsed = new URL(rawBase);
    const defaultPort =
      parsed.protocol === 'wss:' ? DEFAULT_PORT_WSS : DEFAULT_PORT_WS;
    const portField =
      parsed.port.length > 0 ? parsed.port : defaultPort;
    let pathField = parsed.pathname;
    if (pathField === '/' || pathField === '') {
      pathField = '';
    } else if (pathField.endsWith('/')) {
      pathField = pathField.slice(0, -1);
    }
    return {
      urlField: rawBase,
      portField,
      pathField,
    };
  } catch {
    return {
      urlField: rawBase,
      portField:
        mainPort != null && mainPort > 0
          ? String(mainPort)
          : TP_CLIENT_FALLBACK_OCPP_PORT,
      pathField: trimmedMainPath,
    };
  }
};
