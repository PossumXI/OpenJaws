import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Q',
    short_name: 'Q',
    description:
      'OCI-backed Q with OpenJaws, Q_agents, Agent Co-Work, hosted access, and benchmark receipts.',
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
