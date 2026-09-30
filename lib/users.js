import prisma from "@/lib/prisma"

const USER_LIST_SELECT = {
  id: true,
  username: true,
  role: true,
  isActive: true,
  createdAt: true,
  lockedUntil: true,
  _count: { select: { stockLogs: true, transfers: true } },
}

// What the Users screen shows about an account (never the password hash)
function toUserRow(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
    activity: u._count.stockLogs + u._count.transfers,
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
