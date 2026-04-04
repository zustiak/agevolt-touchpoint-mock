/**

 * Wiseasy P5L class 5.5" IPS, 1280×720 HD — portrait logical pixels (full width × full height).

 * Horizontal scroll is never used; layout is always full width of this viewport.

 */

export const KIOSK_WIDTH = 720;

export const KIOSK_HEIGHT = 1280;



/** Per-screen vertical scroll: home stays fixed; overlays with variable content may scroll. */

export const SCREEN_SCROLL_VERTICAL: Record<'language' | 'support', boolean> = {
  language: false,
  support: true,
};

