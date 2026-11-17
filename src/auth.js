const TOKEN = 'token'
const ROLE = 'role'

// Old versions stored the session in localStorage. Wipe it once so
// previously saved logins stop auto-logging you in.
localStorage.removeItem(TOKEN)
localStorage.removeItem(ROLE)

export const auth = {
  getToken: () => sessionStorage.getItem(TOKEN),
  getRole: () => sessionStorage.getItem(ROLE),
  save: (token, role) => {
    sessionStorage.setItem(TOKEN, token)
    sessionStorage.setItem(ROLE, role)
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN)
    sessionStorage.removeItem(ROLE)
  },
}