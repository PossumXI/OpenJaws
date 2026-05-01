import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Checkout Success // Q',
  description: 'Q checkout success page for hosted access and key activation.',
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactNode> {
  const resolved = await searchParams
  const plan =
    typeof resolved.plan === 'string' ? resolved.plan : 'builder'
  const sessionId =
    typeof resolved.session_id === 'string' ? resolved.session_id : null

  return (
    <main className="legal-shell">
      <div className="legal-panel legal-panel-compact">
        <span className="eyebrow">Checkout Complete</span>
        <h1>Q access is on deck.</h1>
        <p className="legal-lead">
          Your checkout was completed. Your Q access will be available shortly.
        </p>

        <section>
          <h2>Plan</h2>
          <p>{plan}</p>
        </section>

        <section>
          <h2>Next Step</h2>
          <p>
            Go back to the console, check usage, then generate your hosted Q
            key and wire it into OpenJaws with <code>/provider key oci &lt;key&gt;</code>.
          </p>
        </section>

        {sessionId ? (
          <section>
            <h2>Stripe Session</h2>
            <p>{sessionId}</p>
          </section>
        ) : null}

        <div className="legal-actions">
          <Link className="hero-button" href="/">
            Back to Q
          </Link>
        </div>
      </div>
    </main>
  )
}
