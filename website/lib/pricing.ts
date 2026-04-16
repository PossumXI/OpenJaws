export type QPlanId = 'starter' | 'builder' | 'operator'

export type QPlanDefinition = {
  id: QPlanId
  name: string
  price: string
  note: string
  points: string[]
  stripePriceEnv: string | null
  monthlyCredits: number
  requestsPerMinute: number
  tokensPerMinute: number
  maxKeys: number
  hostedAccess: boolean
}

export const Q_PLAN_DEFINITIONS: readonly QPlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$0',
    note: 'Free monthly credit',
    points: ['Light prompts', 'BYO key lane', 'Tight limits'],
    stripePriceEnv: null,
    monthlyCredits: 25,
    requestsPerMinute: 6,
    tokensPerMinute: 120_000,
    maxKeys: 1,
    hostedAccess: true,
  },
  {
    id: 'builder',
    name: 'Builder',
    price: '$29',
    note: 'Daily driver',
    points: ['Hosted Q access', 'Higher limits', 'API key controls'],
    stripePriceEnv: 'STRIPE_PRICE_BUILDER',
    monthlyCredits: 300,
    requestsPerMinute: 60,
    tokensPerMinute: 1_200_000,
    maxKeys: 3,
    hostedAccess: true,
  },
  {
    id: 'operator',
    name: 'Operator',
    price: '$149',
    note: 'Crew traffic',
    points: ['Routed work', 'Team keys', 'Benchmark headroom'],
    stripePriceEnv: 'STRIPE_PRICE_OPERATOR',
    monthlyCredits: 3000,
    requestsPerMinute: 180,
    tokensPerMinute: 3_600_000,
    maxKeys: 10,
    hostedAccess: true,
  },
] as const

export function findQPlan(plan: string): QPlanDefinition | null {
  return Q_PLAN_DEFINITIONS.find(candidate => candidate.id === plan) ?? null
}
