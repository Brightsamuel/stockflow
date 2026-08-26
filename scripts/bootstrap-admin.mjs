import { PrismaClient } from "@prisma/client"
import crypto from "crypto"

const prisma = new PrismaClient()

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

const username = "admin"
const password = "changeme123" // change this, then change it again after logging in

const user = await prisma.user.create({
  data: {
    username,
    passwordHash: hashPassword(password),
    role: "SUPER_ADMIN",
  },
})

console.log("Created:", user.username, user.role)
await prisma.$disconnect()