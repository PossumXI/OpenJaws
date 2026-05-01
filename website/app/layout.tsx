import type { Metadata } from 'next'
import { IBM_Plex_Mono, Sora, Space_Grotesk } from 'next/font/google'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://qline.site'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
})

const grotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Q // OpenJaws // Q_agents',
  description:
    'Qline gives you Q, OpenJaws, Q_agents, co-work, benchmark history, and hosted access from one clean surface.',
  metadataBase: new URL(siteUrl),
  keywords: [
    'Q',
    'OpenJaws',
    'Q_agents',
    'Agent Co-Work',
    'OCI Q',
    'Immaculate',
    'TerminalBench',
    'API keys',
  ],
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    title: 'Q // OpenJaws // Q_agents',
    description:
      'Qline gives you Q, OpenJaws, Q_agents, co-work, benchmark history, and hosted access from one clean surface.',
    url: siteUrl,
    siteName: 'Q',
    type: 'website',
    images: [
      {
        url: '/assets/images/q-share-card.png',
        width: 1600,
        height: 900,
        alt: 'Qline.site preview with OpenJaws, Q_agents, and benchmark snapshot',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Q // OpenJaws // Q_agents',
    description:
      'Qline gives you Q, OpenJaws, Q_agents, co-work, benchmark history, and hosted access from one clean surface.',
    images: ['/assets/images/q-share-card.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${sora.variable} ${grotesk.variable} ${plexMono.variable}`}
      >
        {children}
      </body>
    </html>
  )
}
