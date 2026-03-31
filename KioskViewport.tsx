import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { KIOSK_HEIGHT, KIOSK_WIDTH } from './kioskSpec';

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
    <View style={styles.backdrop}>
      <View
        style={[
          styles.deviceShell,
          {
            transform: [{ translateY: topCompensation }, { scale }],
          },
        ]}
      >
        <View style={styles.inner}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#d4d4d4',
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
