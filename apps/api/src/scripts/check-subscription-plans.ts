
import 'dotenv/config'
import mongoose from 'mongoose'
import { SubscriptionPlanModel } from '../modules/subscription/subscription-plan.model'

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing')
  }

  await mongoose.connect(process.env.MONGODB_URI)

  const plans = await SubscriptionPlanModel.find()
    .sort({ displayOrder: 1 })
    .lean()

  for (const plan of plans) {
    console.log(
      `${plan.code}: ₹${(plan.pricePaise / 100).toFixed(2)}`,
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
