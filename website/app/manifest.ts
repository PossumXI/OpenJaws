import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Q',
    short_name: 'Q',
    description:
      'OCI-backed Q access, credits, plans, API keys, and usage receipts.',
    start_url: '/',
    display: 'standalone',
    background_color: '#020507',
    theme_color: '#040a11',
    icons: [
      {
        src: '/assets/images/q-emblem.png',
        sizes: '1200x1200',
        type: 'image/png',
      },
    ],
  }
}
