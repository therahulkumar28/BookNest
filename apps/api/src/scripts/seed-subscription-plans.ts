
import 'dotenv/config'
import mongoose from 'mongoose'

import {
    SubscriptionPlanModel,
} from '../modules/subscription/subscription-plan.model'

const plans = [
    {
        code: 'FREE_TRIAL',
        name: '30-Day Free Trial',
        durationDays: 30,
        pricePaise: 0,
        displayOrder: 1,
    },
    {
        code: 'MONTHLY',
        name: 'Monthly',
        durationMonths: 1,
        pricePaise: 49900,
        displayOrder: 2,
    },
    {
        code: 'QUARTERLY',
        name: 'Quarterly',
        durationMonths: 3,
        pricePaise: 129900,
        displayOrder: 3,
    },
    {
        code: 'YEARLY',
        name: 'Yearly',
        durationMonths: 12,
        pricePaise: 499900,
        displayOrder: 4,
    },
    {
        code: 'FIVE_YEAR',
        name: 'Five-Year',
        durationMonths: 60,
        pricePaise: 1999900,
        displayOrder: 5,
    },
] as const

async function main(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI

    if (!mongoUri) {
        throw new Error('MONGODB_URI is missing')
    }

    await mongoose.connect(mongoUri)

    for (const plan of plans) {
        const result = await SubscriptionPlanModel.updateOne(
            { code: plan.code },
            {
                $setOnInsert: {
                    ...plan,
                    currency: 'INR',
                    isActive: true,
                },
            },
            { upsert: true, runValidators: true },
        )

        console.log(
            `${plan.code}: ${result.upsertedCount ? 'created' : 'already exists'
            }`,
        )
    }
}

main()
    .catch((error) => {
        console.error('Seed failed:', error)
        process.exitCode = 1
    })
    .finally(async () => {
        await mongoose.disconnect()
    })
