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
  title: 'Q // Intelligence With Every Frame',
  description:
    'OCI-backed Q access, credits, plans, API keys, and usage receipts in one cinematic command-mark landing page.',
  metadataBase: new URL(siteUrl),
  keywords: [
    'Q',
    'OpenJaws',
    'OCI Q',
    'API keys',
    'credits',
    'hosted AI',
    'Immaculate',
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
    title: 'Q // Intelligence With Every Frame',
    description:
      'OCI-backed Q access, credits, plans, API keys, and usage receipts in one cinematic command-mark landing page.',
    url: siteUrl,
    siteName: 'Q',
    type: 'website',
    images: ['/assets/images/q-poster.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Q // Intelligence With Every Frame',
    description:
      'OCI-backed Q access, credits, plans, API keys, and usage receipts in one cinematic command-mark landing page.',
    images: ['/assets/images/q-poster.png'],
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
