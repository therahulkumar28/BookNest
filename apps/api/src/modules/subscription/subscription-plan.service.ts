
import {
  SubscriptionPlanModel,
} from './subscription-plan.model'

import {
  SUBSCRIPTION_PLAN_CODES,
} from './tenant-subscription.model'

export type SubscriptionPlanCode =
  (typeof SUBSCRIPTION_PLAN_CODES)[number]

export async function getActiveSubscriptionPlans() {
  return SubscriptionPlanModel.find({
    isActive: true,
  })
    .select(
      'code name durationDays durationMonths pricePaise currency displayOrder',
    )
    .sort({ displayOrder: 1 })
    .lean()
}

export async function getSubscriptionPlanByCode(
  code: SubscriptionPlanCode,
) {
  return SubscriptionPlanModel.findOne({
    code,
    isActive: true,
  }).lean()
}
