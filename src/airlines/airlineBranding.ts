type AirlineBranding = {
  name: string
  logoSymbolUrl: string | null
  logoLockupUrl: string | null
}

const airlineNamesByCode: Record<string, string> = {
  AA: "American Airlines",
  AC: "Air Canada",
  AF: "Air France",
  AI: "Air India",
  AM: "Aeromexico",
  AS: "Alaska Airlines",
  AV: "Avianca",
  BA: "British Airways",
  B6: "JetBlue",
  BR: "EVA Air",
  CM: "Copa Airlines",
  DL: "Delta Air Lines",
  EI: "Aer Lingus",
  EK: "Emirates",
  F9: "Frontier Airlines",
  FI: "Icelandair",
  IB: "Iberia",
  KE: "Korean Air",
  KL: "KLM",
  LH: "Lufthansa",
  NK: "Spirit Airlines",
  PR: "Philippine Airlines",
  QR: "Qatar Airways",
  TP: "TAP Air Portugal",
  UA: "United Airlines",
  VS: "Virgin Atlantic",
}

function normalizeAirlineCode(
  value?: string | null,
): string | null {
  const code = value?.trim().toUpperCase()

  return code || null
}

export function getFallbackAirlineBranding(
  airlineCode?: string | null,
): AirlineBranding | null {
  const code =
    normalizeAirlineCode(airlineCode)

  if (!code) {
    return null
  }

  const name =
    airlineNamesByCode[code]

  if (!name) {
    return null
  }

  return {
    name,
    logoSymbolUrl: null,
    logoLockupUrl: null,
  }
}