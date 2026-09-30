// How each kind of stock log is named, coloured and counted, shared by every screen,
// report and document. "Used" and "Issued" are stock outs to a project or an external party.
export const MOVEMENT = {
  OPENING: { label: "Opening balance", tone: "brand" },
  IN: { label: "Received", tone: "success" },
  TRANSFER_IN: { label: "Transfer in", tone: "info" },
  TRANSFER_OUT: { label: "Transfer out", tone: "info" },
  USED: { label: "Used (field)", tone: "warning" },
  ISSUED: { label: "Issued", tone: "warning" },
  ADJUSTED: { label: "Adjusted", tone: "neutral" },
  EDITED: { label: "Edited", tone: "neutral" },
  REMOVED: { label: "Removed", tone: "danger" },
  RESTORED: { label: "Restored", tone: "teal" },
}

// Log types whose quantity is the stock moved; the others record an adjustment
export const MOVE_TYPES = ["IN", "TRANSFER_IN", "TRANSFER_OUT"]
export const ADJUST_TYPES = ["EDIT", "DELETE", "RESTORE"]

// log: { type, projectId, recipientId, adjustment }; systemStore: the log is in the hidden opening-balance store
export function movementKind(log, systemStore = false) {
  switch (log.type) {
    case "IN": return systemStore ? "OPENING" : "IN"
    case "TRANSFER_IN": return "TRANSFER_IN"
    case "TRANSFER_OUT": return log.projectId ? "USED" : log.recipientId ? "ISSUED" : "TRANSFER_OUT"
    case "EDIT": return log.adjustment ? "ADJUSTED" : "EDITED"
    case "DELETE": return "REMOVED"
    case "RESTORE": return "RESTORED"
    default: return "EDITED"
  }
}

// How much the log changed the store's balance (+ in, − out)
export function signedChange(log) {
  switch (log.type) {
    case "IN":
    case "TRANSFER_IN":
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
  { value: "adjustments", label: "Adjustments, removals and restores" },
]
