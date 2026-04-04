import { FontAwesome5 } from '@expo/vector-icons';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Matches `connectorIdleRfidInfoIcon`: icon `right: 10`, `AppIcon` size 52. */
const BUBBLE_INFO_ICON_RIGHT = 10;
const BUBBLE_INFO_ICON_SIZE = 52;
const BUBBLE_INFO_ICON_CENTER_FROM_RIGHT = BUBBLE_INFO_ICON_RIGHT + BUBBLE_INFO_ICON_SIZE / 2;

/** FAB circle stays 96px; chevron fills more of the interior; border matches kiosk strokes. */
const FAB_SIZE = 96;
const FAB_BORDER_WIDTH = 4;
const FAB_CHEVRON_SIZE = 58;
/** Po zmiznutí dolnej šípky (scroll úplne dole): neviditeľná zóna pohltí klik, aby netrafil obsah pod ňou. */
const BOTTOM_FAB_GHOST_MS = 1000;
/** Align FAB horizontal center with info icon center (may overlap the “i”). */
const DEFAULT_FAB_RIGHT = BUBBLE_INFO_ICON_CENTER_FROM_RIGHT - FAB_SIZE / 2;

/** Pomoc a návody / screens without bubble “i” — inset from right. */
export const BUBBLE_SNAP_SCROLL_FAB_RIGHT_INFO = 14;

type BubbleSnapScrollProps = {
  children: ReactNode;
  /** Vertical gap between bubbles (matches parent card gap). */
  gap?: number;
  /**
   * Distance from scroll port’s right edge to FAB’s right edge.
   * Default aligns FAB center with bubble info icon; negative values extend past the edge.
   */
  fabRight?: number;
  /** Merged into ScrollView `style` (e.g. border). */
  scrollStyle?: StyleProp<ViewStyle>;
  /** Merged into ScrollView `contentContainerStyle` (padding, gap). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  bounces?: boolean;
  scrollUpAccessibilityLabel?: string;
  scrollDownAccessibilityLabel?: string;
};

/**
 * Vertical scroll for stacked “bubbles” with:
 * - snap to each bubble top (measured heights)
 * - floating down / up controls (down bottom-right, up top-right of scroll port)
 * - smooth scroll via native `scrollTo({ animated: true })`
 *
 * Parent must give this view bounded height (`flex: 1`, `minHeight: 0`).
 */
export function BubbleSnapScroll({
  children,
  gap = 8,
  fabRight = DEFAULT_FAB_RIGHT,
  scrollStyle,
  contentContainerStyle,
  bounces = false,
  scrollUpAccessibilityLabel = 'Scroll up',
  scrollDownAccessibilityLabel = 'Scroll down',
}: BubbleSnapScrollProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const childArr = useMemo(() => Children.toArray(children).filter((c) => c != null), [children]);
  const count = childArr.length;

  const [heights, setHeights] = useState<number[]>(() => new Array(count).fill(0));
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [bottomFabGhost, setBottomFabGhost] = useState(false);
  const prevShowDownRef = useRef<boolean | undefined>(undefined);
  const bottomGhostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHeights((prev) => {
      if (prev.length === count) return prev;
      return new Array(count).fill(0);
    });
  }, [count]);

  const snapOffsets = useMemo(() => {
    const offs: number[] = [];
    let acc = 0;
    for (let i = 0; i < heights.length; i += 1) {
      const h = heights[i];
      if (h == null || h <= 0) continue;
      offs.push(acc);
      acc += h + gap;
    }
    return offs;
  }, [gap, heights]);

  const maxScrollY = Math.max(0, contentH - viewportH);

  const showUp = maxScrollY > 4 && scrollY > 12;
  const showDown = maxScrollY > 4 && scrollY < maxScrollY - 12;

  useEffect(() => {
    const prev = prevShowDownRef.current;
    prevShowDownRef.current = showDown;

    if (showDown) {
      if (bottomGhostTimerRef.current) {
        clearTimeout(bottomGhostTimerRef.current);
        bottomGhostTimerRef.current = null;
      }
      setBottomFabGhost(false);
      return;
    }

    if (prev === true && showDown === false && maxScrollY > 4) {
      setBottomFabGhost(true);
      if (bottomGhostTimerRef.current) clearTimeout(bottomGhostTimerRef.current);
      bottomGhostTimerRef.current = setTimeout(() => {
        bottomGhostTimerRef.current = null;
        setBottomFabGhost(false);
      }, BOTTOM_FAB_GHOST_MS);
    }
  }, [showDown, maxScrollY]);

  useEffect(
    () => () => {
      if (bottomGhostTimerRef.current) {
        clearTimeout(bottomGhostTimerRef.current);
        bottomGhostTimerRef.current = null;
      }
    },
    []
  );

  const onChildLayout = useCallback((index: number, h: number) => {
    if (h <= 0) return;
    setHeights((prev) => {
      if (prev[index] === h) return prev;
      const next = [...prev];
      next[index] = h;
      return next;
    });
  }, []);

  const viewportStep = useMemo(() => {
    if (maxScrollY <= 0) return 0;
    if (viewportH <= 0) return Math.min(240, maxScrollY);
    return Math.max(96, Math.min(Math.round(viewportH * 0.88), maxScrollY));
  }, [maxScrollY, viewportH]);

  const scrollDown = useCallback(() => {
    const y = scrollY;
    if (snapOffsets.length >= 2) {
      const nextSnap = snapOffsets.find((s) => s > y + 4);
      const target =
        nextSnap !== undefined ? nextSnap : y < maxScrollY - 2 ? maxScrollY : y;
      scrollRef.current?.scrollTo({ y: target, animated: true });
      return;
    }
    const target = Math.min(y + viewportStep, maxScrollY);
    if (target > y + 1) scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [maxScrollY, scrollY, snapOffsets, viewportStep]);

  const scrollUp = useCallback(() => {
    const y = scrollY;
    if (snapOffsets.length >= 2) {
      let prevSnap: number | undefined;
      for (let i = snapOffsets.length - 1; i >= 0; i -= 1) {
        const s = snapOffsets[i];
        if (s < y - 4) {
          prevSnap = s;
          break;
        }
      }
      const target = prevSnap !== undefined ? prevSnap : 0;
      scrollRef.current?.scrollTo({ y: target, animated: true });
      return;
    }
    const target = Math.max(y - viewportStep, 0);
    if (target < y - 1) scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [scrollY, snapOffsets, viewportStep]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);

  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportH(Math.round(e.nativeEvent.layout.height));
  }, []);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    setContentH(h);
  }, []);

  return (
    <View style={styles.port} onLayout={onViewportLayout}>
      <ScrollView
        ref={scrollRef}
        style={[styles.scroll, Platform.OS === 'web' && styles.scrollWeb, scrollStyle]}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        snapToOffsets={snapOffsets.length >= 2 ? snapOffsets : undefined}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        keyboardShouldPersistTaps="handled"
        bounces={bounces}
      >
        {childArr.map((child, i) => (
          <View
            key={isValidElement(child) && child.key != null ? String(child.key) : `bubble-${i}`}
            style={i < count - 1 ? { marginBottom: gap } : undefined}
            onLayout={(e) => onChildLayout(i, Math.round(e.nativeEvent.layout.height))}
          >
            {child}
          </View>
        ))}
      </ScrollView>

      {showUp ? (
        <Pressable
          accessibilityLabel={scrollUpAccessibilityLabel}
          onPress={scrollUp}
          style={({ pressed }) => [
            styles.fab,
            styles.fabTop,
            { right: fabRight },
            pressed && styles.fabPressed,
          ]}
        >
          <FontAwesome5 name="chevron-up" size={FAB_CHEVRON_SIZE} color="#000000" />
        </Pressable>
      ) : null}

      {showDown ? (
        <Pressable
          accessibilityLabel={scrollDownAccessibilityLabel}
          onPress={scrollDown}
          style={({ pressed }) => [
            styles.fab,
            styles.fabBottom,
            { right: fabRight },
            pressed && styles.fabPressed,
          ]}
        >
          <FontAwesome5 name="chevron-down" size={FAB_CHEVRON_SIZE} color="#000000" />
        </Pressable>
      ) : null}

      {bottomFabGhost && !showDown ? (
        <View
          pointerEvents="box-only"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.fab, styles.fabBottom, styles.fabGhostHit, { right: fabRight }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  port: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
  /** Web: hide native scrollbar (indicator already off; some browsers still paint overflow bar). */
  scrollWeb: {
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  } as Record<string, string>,
  scrollContent: {
    paddingBottom: 4,
  },
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: FAB_BORDER_WIDTH,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' } as Record<string, string>)
      : null),
  },
  fabTop: {
    top: 8,
  },
  fabBottom: {
    bottom: 12,
  },
  /** Neviditeľná, rovnaká veľkosť ako FAB; nad obsahom scrollu (zIndex). */
  fabGhostHit: {
    opacity: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    zIndex: 101,
  },
  fabPressed: {
    opacity: 0.85,
  },
});
