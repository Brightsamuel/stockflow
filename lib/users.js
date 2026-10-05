import prisma from "@/lib/prisma"

const USER_LIST_SELECT = {
  id: true,
  username: true,
  role: true,
  canApprove: true,
  isActive: true,
  createdAt: true,
  lockedUntil: true,
  _count: { select: { stockLogs: true, transfers: true, deletions: true, restorations: true, approvals: true } },
}

// What the Users screen shows about an account (never the password hash)
function toUserRow(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    canApprove: u.canApprove,
    isActive: u.isActive,
    createdAt: u.createdAt,
    locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
    activity: u._count.stockLogs + u._count.transfers + u._count.deletions + u._count.restorations + u._count.approvals,
  }
}

export async function listUsers() {
  const users = await prisma.user.findMany({ select: USER_LIST_SELECT, orderBy: { createdAt: "asc" } })
  return users.map(toUserRow)
}

export async function getUserRow(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: USER_LIST_SELECT })
  return user && toUserRow(user)
}
