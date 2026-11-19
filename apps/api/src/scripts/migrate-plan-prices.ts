
import 'dotenv/config'
import mongoose from 'mongoose'

import {
  SubscriptionPlanModel,
} from '../modules/subscription/subscription-plan.model'

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI

  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing')
  }

  await mongoose.connect(mongoUri)

  const plans = await SubscriptionPlanModel.find()

  for (const plan of plans) {
    const raw = plan.toObject() as Record<string, unknown>

    if (typeof raw.pricePaise === 'number') {
      console.log(`${plan.code}: already migrated`)
      continue
    }

    const oldPrice = raw.priceAmount

    if (
      typeof oldPrice !== 'number' ||
      !Number.isSafeInteger(oldPrice) ||
      oldPrice < 0
    ) {
      throw new Error(
        `Invalid legacy price for ${plan.code}`,
      )
    }

    await SubscriptionPlanModel.collection.updateOne(
      { _id: plan._id, pricePaise: { $exists: false } },
      {
        $set: { pricePaise: oldPrice * 100 },
        $unset: { priceAmount: '' },
      },
    )

    console.log(`${plan.code}: migrated`)
  }

  console.log('Price migration complete')
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
