import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy // Q',
  description:
    'Privacy policy for Q hosted access, usage metering, billing, and account services.',
}

const companyName =
  'Arobi Technology Alliance A Opal Mar Group Corporation Company'

export default function PrivacyPage(): React.ReactNode {
  return (
    <main className="legal-shell">
      <div className="legal-panel">
        <span className="eyebrow">Privacy Policy</span>
        <h1>{companyName}</h1>
        <p className="legal-lead">
          This policy describes what data the hosted Q surface needs to operate.
        </p>

        <section>
          <h2>1. Data We Process</h2>
          <p>
            We may process account information, billing records, API key
            metadata, usage receipts, rate-limit events, support messages,
            moderation events, and technical logs needed to protect and operate
            the service.
          </p>
        </section>

        <section>
          <h2>2. Why We Use It</h2>
          <p>
            We use this data to provide access, issue or revoke API keys, meter
            usage, enforce credits and limits, prevent abuse, provide support,
            improve reliability, and comply with legal obligations.
          </p>
        </section>

        <section>
          <h2>3. Sharing</h2>
          <p>
            We may share data with hosting, billing, security, analytics, and
            infrastructure providers only as needed to run the service. We may
            also disclose data when required by law or to protect the service,
            users, or our rights.
          </p>
        </section>

        <section>
          <h2>4. Retention and Security</h2>
          <p>
            We retain data for operational, security, billing, and compliance
            purposes for as long as reasonably necessary. We use technical and
            organizational safeguards, but no system can promise absolute
            security.
          </p>
        </section>

        <section>
          <h2>5. Location</h2>
          <p>
            Principal business and registration area: New Jersey 07419, USA.
          </p>
        </section>
      </div>
    </main>
  )
}
