import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Checkout Canceled // Q',
  description: 'Q checkout cancellation page for hosted access.',
}

export default async function CancelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactNode> {
  const resolved = await searchParams
  const plan =
    typeof resolved.plan === 'string' ? resolved.plan : 'builder'

  return (
    <main className="legal-shell">
      <div className="legal-panel legal-panel-compact">
        <span className="eyebrow">Checkout Canceled</span>
        <h1>No charge was completed.</h1>
        <p className="legal-lead">
          The hosted Q plan stayed unchanged. You can return to the console and
          try again when you are ready.
        </p>

        <section>
          <h2>Plan</h2>
          <p>{plan}</p>
        </section>

        <div className="legal-actions">
          <Link className="hero-button" href="/">
            Back to Q
          </Link>
        </div>
      </div>
    </main>
  )
}
