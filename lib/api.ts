
// all auth comes from the httpOnly cookie
export async function apiFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    credentials: "include" // ensures cookie is sent cross-origin if needed
  })
}
