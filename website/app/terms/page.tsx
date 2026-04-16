import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Use // Q',
  description: 'Terms of use for Q hosted access and OpenJaws-linked services.',
}

const companyName =
  'Arobi Technology Alliance A Opal Mar Group Corporation Company'

export default function TermsPage(): React.ReactNode {
  return (
    <main className="legal-shell">
      <div className="legal-panel">
        <span className="eyebrow">Terms of Use</span>
        <h1>{companyName}</h1>
        <p className="legal-lead">
          These terms govern hosted Q access, API keys, credits, subscriptions,
          and related services.
        </p>

        <section>
          <h2>1. Service</h2>
          <p>
            Q, OpenJaws-linked hosted access, API keys, credits, usage
            reporting, and related account surfaces are offered as a software
            and infrastructure service.
          </p>
        </section>

        <section>
          <h2>2. Accounts and Keys</h2>
          <p>
            You are responsible for activity under your account, API keys, and
            team access. We may suspend, throttle, rotate, or revoke access for
            abuse, non-payment, security risk, policy violations, or service
            protection.
          </p>
        </section>

        <section>
          <h2>3. Fees and No Refunds</h2>
          <p>
            All fees are final. To the fullest extent permitted by applicable
            law, payments, subscription charges, credit purchases, usage
            charges, and setup fees are non-refundable.
          </p>
          <p>
            That includes cases involving delivery format, timing, partial use,
            non-use, rate limiting, moderation, suspension, feature changes,
            benchmark variance, subjective dissatisfaction, or how the service
            was described in marketing or product materials.
          </p>
          <p>
            Nothing in these terms limits rights that cannot be waived under
            applicable law.
          </p>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>
            You may not use the service for unlawful activity, abuse, account
            sharing beyond your plan, evasion of limits, credential misuse, or
            attempts to degrade service availability for other users.
          </p>
        </section>

        <section>
          <h2>5. Governing Law and Venue</h2>
          <p>
            To the fullest extent permitted by law, these terms are governed by
            the laws of the State of New Jersey, USA, without regard to conflict
            of law rules. Any dispute arising out of or relating to these terms
            or the service must be brought exclusively in the state or federal
            courts located in New Jersey, unless applicable law requires
            otherwise.
          </p>
        </section>

        <section>
          <h2>6. Business Location</h2>
          <p>
            Principal business and registration area: New Jersey 07419, USA.
          </p>
        </section>
      </div>
    </main>
  )
}
