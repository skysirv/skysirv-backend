import { airportDirectory } from "../../data/airports.js"

export function cleanAirportCode(value: unknown) {
  if (typeof value !== "string") return null

  const code = value.trim().toUpperCase()

  if (!/^[A-Z0-9]{3,4}$/.test(code)) return null
  if (!airportDirectory[code]) return null

  return code
}

export function getAirportDisplayLabel(code: string) {
  const airport = airportDirectory[code]

  if (!airport) return code

  return `${airport.city} (${code})`
}

export function getAirportReferenceForPrompt() {
  return Object.entries(airportDirectory)
    .sort(([codeA, airportA], [codeB, airportB]) => {
      const countryCompare = airportA.country.localeCompare(airportB.country)
      if (countryCompare !== 0) return countryCompare

      const cityCompare = airportA.city.localeCompare(airportB.city)
      if (cityCompare !== 0) return cityCompare

      return codeA.localeCompare(codeB)
    })
    .map(
      ([code, airport]) =>
        `${code}: ${airport.city}, ${airport.country} — ${airport.name}`,
    )
    .join("\n")
}

export function getAmbiguousAirportReferenceForPrompt() {
  const groupedByCity = Object.entries(airportDirectory).reduce<
    Record<string, Array<{ code: string; city: string; country: string; name: string }>>
  >((groups, [code, airport]) => {
    const key = airport.city.trim().toLowerCase()

    if (!groups[key]) {
      groups[key] = []
    }

    groups[key].push({
      code,
      city: airport.city,
      country: airport.country,
      name: airport.name,
    })

    return groups
  }, {})

  return Object.values(groupedByCity)
    .filter((airports) => airports.length > 1)
    .map((airports) => {
      const city = airports[0]?.city ?? "Unknown city"

      const options = airports
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((airport) => `${airport.code} ${airport.name}, ${airport.country}`)
        .join("; ")

      return `${city}: ${options}`
    })
    .join("\n")
}