export type SubscriptionType = 'max' | 'pro' | 'team' | 'enterprise'

export type RateLimitTier =
  | 'default_claude_max_5x'
  | 'default_claude_max_20x'
  | (string & {})

export type BillingType =
  | 'stripe_subscription'
  | 'stripe_subscription_contracted'
  | 'apple_subscription'
  | 'google_play_subscription'
  | (string & {})

export type OAuthProfileResponse = {
  account: {
    uuid: string
    email: string
    email_address?: string
    display_name?: string | null
    created_at?: string
  }
  organization: {
    uuid: string
    name?: string | null
    organization_type?: string | null
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean | null
    billing_type?: BillingType | null
    subscription_created_at?: string | null
  }
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  account?: {
    uuid: string
    email_address: string
  }
  organization?: {
    uuid: string
  }
}

export type OAuthTokens = {
  accessToken: string
  refreshToken?: string
  expiresAt: number | null
  scopes: string[]
  subscriptionType?: SubscriptionType | null
  rateLimitTier?: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: {
    uuid: string
    emailAddress: string
    organizationUuid?: string
  }
}

export type UserRolesResponse = {
  organization_role?: string | null
  workspace_role?: string | null
  organizationRole?: string | null
  workspaceRole?: string | null
}

export type ReferralCampaign = 'openjaws_guest_pass' | (string & {})

export type ReferrerRewardInfo = {
  amount_minor_units: number
  currency: string
}

export type ReferralEligibilityResponse = {
  eligible: boolean
  remaining_passes?: number
  referral_code_details?: {
    referral_link?: string
    campaign?: ReferralCampaign
  } | null
  referrer_reward?: ReferrerRewardInfo | null
}

export type ReferralRedemptionsResponse = {
  redemptions?: Array<{
    redeemed_at?: string
    referee_email?: string
    status?: string
  }>
}
