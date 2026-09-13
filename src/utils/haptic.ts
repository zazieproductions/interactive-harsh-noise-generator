/**
 * Fire-and-forget haptic tap. Android Chrome honours `navigator.vibrate`;
 * iOS Safari ignores it (and the Web Haptics API is not shipped), so this is
 * strictly a progressive enhancement — never required for feedback, since
 * every action also has a visible state change.
 */
export function haptic(pattern: number | number[] = 8): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported or blocked — ignore */
  }
}
