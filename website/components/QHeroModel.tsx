'use client'

import Image from 'next/image'
import * as React from 'react'

export function QHeroModel(): React.ReactNode {
  React.useEffect(() => {
    void import('@google/model-viewer')
  }, [])

  return (
    <div className="hero-stage">
      <div className="hero-stage-frame">
        <div className="hero-stage-copy">
          <span>Q // live model</span>
          <strong>Real local GLB asset</strong>
        </div>

        {React.createElement('model-viewer', {
          src: '/assets/models/q-manifold.glb',
          class: 'q-model-viewer',
          poster: '/assets/images/q-poster.png',
          'camera-controls': true,
          'interaction-prompt': 'none',
          'auto-rotate': true,
          'auto-rotate-delay': 0,
          'rotation-per-second': '24deg',
          exposure: '1.05',
          shadowIntensity: '0',
          loading: 'eager',
          alt: 'Q hero model',
        })}
      </div>

      <div className="hero-emblem-card">
        <Image
          src="/assets/images/q-emblem.png"
          alt="Q emblem"
          width={1200}
          height={1200}
        />
      </div>
    </div>
  )
}
