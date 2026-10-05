// How each kind of stock log is named, coloured and counted, shared by every screen,
// report and document. "Used" and "Issued" are stock outs to a project or an external party.
export const MOVEMENT = {
  OPENING: { label: "Opening balance", tone: "brand" },
  OPENING_STOCK: { label: "Opening stock", tone: "brand" },
  OPENING_ISSUED: { label: "Opening stock issued", tone: "brand" },
  IN: { label: "Received", tone: "success" },
  TRANSFER_IN: { label: "Transfer in", tone: "info" },
  TRANSFER_OUT: { label: "Transfer out", tone: "info" },
  USED: { label: "Used (field)", tone: "warning" },
  ISSUED: { label: "Issued", tone: "warning" },
  ADJUSTED: { label: "Adjusted", tone: "neutral" },
  EDITED: { label: "Edited", tone: "neutral" },
  REMOVED: { label: "Removed", tone: "danger" },
  RESTORED: { label: "Restored", tone: "teal" },
  RETURNED: { label: "Returned from project", tone: "teal" },
  RELEASED: { label: "Released to general stock", tone: "neutral" },
}

// Log types whose quantity is the stock moved; the others record an adjustment.
// RETURN: stock coming back from a project. RELEASE: a pair of adjustments moving what is left of
// a project's stock onto the general row of the same store.
export const MOVE_TYPES = ["IN", "TRANSFER_IN", "TRANSFER_OUT", "RETURN"]
export const ADJUST_TYPES = ["EDIT", "DELETE", "RESTORE", "RELEASE"]

// Where-clause for log lines and transfer rows that still count: not part of a deleted note.
// Every balance, report, history and document query includes it.
export const LIVE = { deletionId: null }

// log: { type, projectId, recipientId, adjustment, openingStock }; systemStore: the log is in the
// hidden opening-balance store. An opening balance issued to a store arrives as "Opening stock".
export function movementKind(log, systemStore = false) {
  switch (log.type) {
    case "IN": return systemStore ? "OPENING" : "IN"
    case "TRANSFER_IN": return log.openingStock ? "OPENING_STOCK" : "TRANSFER_IN"
    case "TRANSFER_OUT":
      if (log.openingStock) return "OPENING_ISSUED"
      return log.projectId ? "USED" : log.recipientId ? "ISSUED" : "TRANSFER_OUT"
    case "EDIT": return log.adjustment ? "ADJUSTED" : "EDITED"
    case "DELETE": return "REMOVED"
    case "RESTORE": return "RESTORED"
    case "RETURN": return "RETURNED"
    case "RELEASE": return "RELEASED"
    default: return "EDITED"
  }
}

// How much the log changed the store's balance (+ in, − out)
export function signedChange(log) {
  switch (log.type) {
    case "IN":
    case "TRANSFER_IN":
    case "RETURN":
      return log.quantity
    case "TRANSFER_OUT":
      return -log.quantity
    default:
      return log.adjustment ?? 0
  }
}

// Report filter for the movement ledger
export const LEDGER_TYPES = [
  { value: "", label: "All movements" },
  { value: "received", label: "Received (stock in)" },
  { value: "transfers", label: "Transfers between stores" },
  { value: "used", label: "Used on projects" },
  { value: "issued", label: "Issued to external parties" },
  { value: "returns", label: "Returned from projects" },
  { value: "adjustments", label: "Adjustments, removals, restores and releases" },
]
