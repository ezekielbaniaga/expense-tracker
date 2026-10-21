const BROWSERS: [RegExp, string][] = [
  [/\bEdgA?\/|\bEdgiOS\/|\bEdge\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

// iPhone and iPad come before Mac and Linux: their UAs say "like Mac OS X", Android's says "Linux"
const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b|\bX11\b/, "Linux"],
];

function firstMatch(table: [RegExp, string][], ua: string): string | null {
  return table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
}

/** "Firefox on Linux" from a User-Agent; the raw string when the browser is unknown, "Unknown device" when absent. */
export function deviceName(ua: string | null | undefined): string {
  const raw = ua?.trim();
  if (!raw) return "Unknown device";
  const browser = firstMatch(BROWSERS, raw);
  if (!browser) return raw;
  const system = firstMatch(SYSTEMS, raw);
  return system ? `${browser} on ${system}` : browser;
}
