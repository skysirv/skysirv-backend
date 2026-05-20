declare const process: {
  env: {
    NEXT_PUBLIC_API_BASE_URL?: string
  }
}

export async function isBackendAvailable() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

  if (!apiBaseUrl) return false

  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      method: "GET",
      cache: "no-store",
    })

    return response.ok
  } catch {
    return false
  }
}