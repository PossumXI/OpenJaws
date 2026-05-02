import type { Metadata } from 'next'

const releaseVersion = '0.1.8'
const releaseTag = `jaws-v${releaseVersion}`
const releaseBase = `https://github.com/PossumXI/OpenJaws/releases/download/${releaseTag}`
const releaseUrl = `https://github.com/PossumXI/OpenJaws/releases/tag/${releaseTag}`

const packages = [
  {
    label: 'Windows setup',
    href: '/downloads/jaws/windows',
    file: `JAWS_${releaseVersion}_x64-setup.exe`,
  },
  {
    label: 'Windows MSI',
    href: '/downloads/jaws/windows-msi',
    file: `JAWS_${releaseVersion}_x64_en-US.msi`,
  },
  {
    label: 'macOS disk image',
    href: '/downloads/jaws/macos',
    file: `JAWS_${releaseVersion}_x64.dmg`,
  },
  {
    label: 'Linux Debian',
    href: '/downloads/jaws/linux-deb',
    file: `JAWS_${releaseVersion}_amd64.deb`,
  },
  {
    label: 'Linux RPM',
    href: '/downloads/jaws/linux-rpm',
    file: `JAWS-${releaseVersion}-1.x86_64.rpm`,
  },
]

export const metadata: Metadata = {
  title: `Download JAWS Desktop ${releaseVersion} // Qline`,
  description:
    'Download the signed JAWS Desktop release for Windows, macOS, and Linux from the official Qline mirror.',
  alternates: {
    canonical: '/downloads/jaws',
  },
}

export default function JawsDownloadPage(): React.ReactNode {
  return (
    <main className="page-shell">
      <div className="page-backdrop" />
      <div className="page-noise" />

      <header className="topbar">
        <a className="brand-lockup" href="/">
          <div>
            <span>Q</span>
            <strong>JAWS Desktop</strong>
          </div>
        </a>
        <div className="topbar-actions">
          <a className="topbar-link" href={releaseUrl} target="_blank" rel="noreferrer">
            GitHub release
          </a>
          <a className="hero-button hero-button-alt" href="/#plans">
            Qline plans
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">SIGNED DESKTOP RELEASE</span>
          <h1>JAWS {releaseVersion}</h1>
          <p className="hero-kicker">OpenJaws, Q, and Q_agents in a native app.</p>
          <p className="hero-copy-minimal">
            Install the current JAWS Desktop build, use the signed updater, and keep
            local OpenJaws work tied to Qline, Immaculate, and Arobi records.
          </p>
          <div className="hero-actions">
            <a className="hero-button" href="/downloads/jaws/windows">
              Download for Windows
            </a>
            <a className="hero-button hero-button-alt" href="/downloads/jaws/latest.json">
              Updater manifest
            </a>
            <a className="hero-button hero-button-alt" href="https://iorch.net/downloads/jaws">
              iorch mirror
            </a>
          </div>
          <div className="hero-rail">
            <span>{releaseTag}</span>
            <span>Signed GitHub assets</span>
            <span>Tauri updater manifest</span>
            <span>Windows, macOS, Linux</span>
          </div>
        </div>
      </section>

      <section className="feature-band">
        <div className="section-heading">
          <span className="eyebrow">Packages</span>
          <h2>Choose your installer.</h2>
          <p>
            These routes redirect to the signed GitHub release assets. The desktop
            updater reads the same signed manifest.
          </p>
        </div>
        <div className="feature-grid">
          {packages.map(pkg => (
            <article className="feature-card" key={pkg.href}>
              <span>{pkg.label}</span>
              <strong>{pkg.file}</strong>
              <p>{releaseBase}/{pkg.file}</p>
              <a className="topbar-link" href={pkg.href}>
                Download
              </a>
            </article>
          ))}
          <article className="feature-card">
            <span>Updater</span>
            <strong>latest.json</strong>
            <p>{releaseBase}/latest.json</p>
            <a className="topbar-link" href="/downloads/jaws/latest.json">
              View manifest
            </a>
          </article>
        </div>
      </section>
    </main>
  )
}
