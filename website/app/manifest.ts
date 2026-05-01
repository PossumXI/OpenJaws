import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Q',
    short_name: 'Q',
    description:
      'Qline gives you Q, OpenJaws, Q_agents, co-work, benchmark history, and hosted access.',
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
