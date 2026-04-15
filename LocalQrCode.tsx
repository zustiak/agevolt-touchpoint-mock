import QRCode from 'react-native-qrcode-svg';
import { StyleSheet, View } from 'react-native';

type Props = {
  value: string;
  size: number;
};

const FRAME_PADDING = 18;

export function LocalQrCode({ value, size }: Props) {
  const qrSize = Math.max(64, size - FRAME_PADDING * 2);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <QRCode value={value} size={qrSize} quietZone={10} backgroundColor="#ffffff" color="#000000" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
