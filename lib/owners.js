// Built-in owner row that stock without an owner belongs to (seeded by the add_owners_projects migration)
export const NO_OWNER = "unassigned"

export function ownerLabel(owner) {
  return !owner || owner.id === NO_OWNER ? "—" : owner.name
}
