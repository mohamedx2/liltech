import { ApiStatus } from '@/components/api-status';

const eventFacts = [
  { label: 'Dates', value: 'November 21–22, 2026' },
  { label: 'Location', value: 'Campus EPI, Sousse, Tunisia' },
  { label: 'Teams', value: '3–5 participants' },
];

const platformFeatures = [
  {
    title: 'Registration & QR badges',
    description:
      'Team leaders register their teams; every participant receives a personal QR badge by email.',
  },
  {
    title: 'QR check-in',
    description:
      'Staff scan participant badges at the entrance — the event only starts for teams that check in.',
  },
  {
    title: 'Mini-CTF gate',
    description: 'At 20:00 the Mini-CTF opens. A valid flag unlocks the team’s main challenge.',
  },
  {
    title: 'Two challenges, two juries',
    description:
      'Two parallel tracks with isolated jury access, server-side scoring and live leaderboards.',
  },
];

export default function Index() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid var(--color-border)',
          padding: 'var(--space-4) var(--space-6)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--content-width)',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              letterSpacing: '-0.02em',
              fontSize: 'var(--text-lg)',
            }}
          >
            LilTech <span style={{ color: 'var(--color-primary)' }}>2026</span>
          </span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            by GDG on Campus EPI &amp; ISITCom Google Club
          </span>
        </div>
      </header>

      <main
        id="main-content"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 'var(--content-width)',
          margin: '0 auto',
          padding: 'var(--space-12) var(--space-6)',
        }}
      >
        <p
          style={{
            color: 'var(--color-accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
          }}
        >
          November 21–22, 2026 · Sousse
        </p>

        <h1
          style={{
            fontSize: 'var(--text-3xl)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            marginTop: 'var(--space-4)',
            maxWidth: '44rem',
          }}
        >
          One night. Two challenges.{' '}
          <span style={{ color: 'var(--color-primary)' }}>One platform to run it all.</span>
        </h1>

        <p
          style={{
            marginTop: 'var(--space-4)',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-lg)',
            maxWidth: '40rem',
          }}
        >
          The LilTech 2026 platform is the digital hub of the competition: registration, QR
          check-in, Mini-CTF, challenge submissions, jury scoring and live results — all in one
          place.
        </p>

        <div style={{ marginTop: 'var(--space-6)' }}>
          <ApiStatus />
        </div>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
            gap: 'var(--space-4)',
            marginTop: 'var(--space-8)',
            padding: 0,
          }}
        >
          {eventFacts.map((fact) => (
            <div
              key={fact.label}
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4) var(--space-6)',
              }}
            >
              <dt
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {fact.label}
              </dt>
              <dd
                style={{
                  margin: 'var(--space-1) 0 0',
                  fontWeight: 600,
                  fontSize: 'var(--text-base)',
                }}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="features-heading" style={{ marginTop: 'var(--space-12)' }}>
          <h2 id="features-heading" style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>
            What the platform does
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
              gap: 'var(--space-4)',
              marginTop: 'var(--space-6)',
            }}
          >
            {platformFeatures.map((feature) => (
              <article
                key={feature.title}
                style={{
                  background: 'var(--color-bg-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-6)',
                }}
              >
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{feature.title}</h3>
                <p
                  style={{
                    marginTop: 'var(--space-2)',
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <p
          style={{
            marginTop: 'var(--space-12)',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-sm)',
          }}
        >
          Registration opens before the event. This site is under active development — see the
          repository README for how to contribute.
        </p>
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: 'var(--space-6)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        Organized by GDG on Campus EPI and ISITCom Google Club · LilTech 2026
      </footer>
    </div>
  );
}
