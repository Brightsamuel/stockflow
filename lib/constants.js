// Rules shared by the API and the screens
export const MIN_PASSWORD_LENGTH = 8

export const ROLES = ["STANDARD", "ADMIN", "SUPER_ADMIN"]
export const ROLE_LABEL = { STANDARD: "Standard", ADMIN: "Admin", SUPER_ADMIN: "Super admin" }

export function isAdminRole(role) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}
