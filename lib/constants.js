// Rules shared by the API and the screens
export const MIN_PASSWORD_LENGTH = 8

// Lowest to highest. A Viewer can see and print everything but change nothing.
export const ROLES = ["VIEWER", "STANDARD", "ADMIN", "SUPER_ADMIN"]
export const ROLE_LABEL = { VIEWER: "Viewer", STANDARD: "Standard", ADMIN: "Admin", SUPER_ADMIN: "Super admin" }

export function isAdminRole(role) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

// May record stock and change products (everyone except a Viewer)
export function canEdit(role) {
  return ROLES.includes(role) && role !== "VIEWER"
}
