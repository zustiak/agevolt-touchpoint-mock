import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { KIOSK_HEIGHT, KIOSK_WIDTH } from './kioskSpec';

const KIOSK_NO_SELECT_WEB: ViewStyle =
  Platform.OS === 'web' ? ({ userSelect: 'none', WebkitUserSelect: 'none' } as ViewStyle) : {};

type Props = {
  children: ReactNode;
};

/**
 * Fixed 720×1280 logical canvas (5.5" IPS 1280×720 HD in portrait). Scales down uniformly
 * on smaller windows; never enables horizontal panning inside the app.
 */
export function KioskViewport({ children }: Props) {
  const { width: ww, height: wh } = useWindowDimensions();
  const scale = Math.min(1, ww / KIOSK_WIDTH, wh / KIOSK_HEIGHT);
  const topCompensation = -((KIOSK_HEIGHT * (1 - scale)) / 2);

  return (
    <View style={[styles.backdrop, KIOSK_NO_SELECT_WEB]}>
      <View
        style={[
          styles.deviceShell,
          KIOSK_NO_SELECT_WEB,
          {
            transform: [{ translateY: topCompensation }, { scale }],
          },
        ]}
      >
        <View style={[styles.inner, KIOSK_NO_SELECT_WEB]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    overflow: 'hidden',
  },
  deviceShell: {
    width: KIOSK_WIDTH,
    height: KIOSK_HEIGHT,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    width: KIOSK_WIDTH,
    height: KIOSK_HEIGHT,
  },
});
