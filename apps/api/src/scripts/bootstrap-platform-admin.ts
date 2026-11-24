
import 'dotenv/config'
import { assertBootstrapEnvironment } from './bootstrap-platform-admin-policy'
import mongoose from 'mongoose'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { connectDatabase, disconnectDatabase } from '../config/database'
import { UserModel } from '../modules/auth/user.model'
import { hashPassword } from '../modules/auth/password.service'
import { PlatformAdminBootstrapModel } from '../modules/auth/platform-admin-bootstrap.model'
async function main(): Promise<void> {
  assertBootstrapEnvironment(process.env.NODE_ENV, process.env.BOOKNEST_ALLOW_PRODUCTION_BOOTSTRAP)

  await connectDatabase()

  try {
    const existingAdmin = await UserModel.exists({
      role: 'PLATFORM_ADMIN',
    })

    if (existingAdmin) {
      throw new Error(
        'A Platform Admin already exists. Bootstrap is disabled.',
      )
    }

    const rl = createInterface({
      input: stdin,
      output: stdout,
    })

    let fullName: string
    let email: string
    let password: string

    try {
      fullName = (await rl.question('Admin full name: ')).trim()
      email = (await rl.question('Admin email: ')).trim().toLowerCase()
    } finally {
      rl.close()
    }

    password = process.env.BOOKNEST_BOOTSTRAP_PASSWORD ?? ''

    if (!password) {
      throw new Error(
        'BOOKNEST_BOOTSTRAP_PASSWORD must be supplied securely',
      )
    }

    if (fullName.length < 2 || fullName.length > 120) {
      throw new Error('Invalid admin name')
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      throw new Error('Invalid admin email')
    }

    if (password.length < 12 || password.length > 128) {
      throw new Error('Password must be 12–128 characters')
    }

    const passwordHash = await hashPassword(password)

    await mongoose.connection.transaction(async (session) => {
      const existingAdmin = await UserModel.exists({
        role: 'PLATFORM_ADMIN',
      }).session(session)

      if (existingAdmin) {
        throw new Error('Platform Admin already exists')
      }

      const adminId = new mongoose.Types.ObjectId()

      // The fixed _id makes concurrent bootstrap attempts conflict.
      // The claim and user creation commit or roll back together.
      await PlatformAdminBootstrapModel.create(
        [
          {
            _id: 'INITIAL_PLATFORM_ADMIN',
            adminUserId: adminId,
          },
        ],
        { session },
      )

      await UserModel.create(
        [
          {
            _id: adminId,
            fullName,
            email,
            passwordHash,
            role: 'PLATFORM_ADMIN',
            libraryId: null,
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            createdBy: null,
          },
        ],
        { session },
      )
    })

    console.log('Platform Admin created successfully')
  } finally {
    await disconnectDatabase()
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Bootstrap failed',
  )
  process.exitCode = 1
})
