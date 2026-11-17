import { auth } from './auth'

function getGuestId() {
  let id = localStorage.getItem('guestId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('guestId', id)
  }
  return id
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = auth.getToken()
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': getGuestId(),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  })

  // Basahin muna bilang text para hindi mag-crash kapag HTML ang isinagot ng server
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(
      `Server error ${res.status} sa ${method} /api${path}: ${text.replace(/\s+/g, ' ').slice(0, 150)}`
    )
  }

  // Expired/invalid token: drop the session so the UI can't keep using it
  if (res.status === 401 && token) auth.clear()

  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`)
  return data
}