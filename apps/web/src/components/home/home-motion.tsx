'use client';

import { useEffect, useLayoutEffect } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Removable motion layer for the home page only.
 *
 * Every initial hidden state is created here (never in CSS) and inside
 * `gsap.context`, so a thrown error or missing JS leaves the page fully visible.
 */
export function HomeMotion() {
  useIsoLayoutEffect(() => {
    const mounted = document.querySelector<HTMLElement>('[data-home-root]');
    if (!mounted) return undefined;
    const root: HTMLElement = mounted;
    if (typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let cancelled = false;
    const teardown: Array<() => void> = [];
    let ctx: { revert: () => void } | null = null;

    // Lenis drives scrollTop directly; CSS smooth scrolling would fight it.
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    teardown.push(() => {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    });

    async function setup() {
      try {
        const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
          import('lenis'),
        ]);
        if (cancelled) return;

        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });

        const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, anchors: false });
        lenis.on('scroll', ScrollTrigger.update);

        const tick = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        teardown.push(() => {
          gsap.ticker.remove(tick);
          gsap.ticker.lagSmoothing(500, 33);
          lenis.destroy();
        });

        const onAnchorClick = (event: MouseEvent) => {
          const origin = event.target as Element | null;
          const link = origin?.closest?.('a[href^="#"]');
          if (!link) return;
          const href = link.getAttribute('href');
          if (!href || href.length < 2) return;
          const section = root.querySelector<HTMLElement>(href);
          if (!section) return;
          event.preventDefault();
          lenis.scrollTo(section, { offset: -80, duration: 1.2 });
        };
        root.addEventListener('click', onAnchorClick);
        teardown.push(() => root.removeEventListener('click', onAnchorClick));

        const refresh = () => ScrollTrigger.refresh();
        if (document.fonts) void document.fonts.ready.then(refresh).catch(() => undefined);
        window.addEventListener('load', refresh, { once: true });
        teardown.push(() => window.removeEventListener('load', refresh));

        ctx = gsap.context(() => {
          /* 1. Hero entrance — plays once, whole elements only. */
          gsap
            .timeline({ defaults: { ease: 'power3.out' } })
            .from('[data-motion="hero-title"] > span', {
              y: 18,
              opacity: 0,
              duration: 0.7,
              stagger: 0.12,
            })
            .from('[data-motion="hero-lede"]', { y: 18, opacity: 0, duration: 0.7 }, '-=0.35')
            .from(
              '[data-motion="hero-cta"] > *',
              { y: 18, opacity: 0, duration: 0.6, stagger: 0.08 },
              '-=0.45',
            )
            .from(
              '[data-motion="hero-logo"]',
              { opacity: 0, scale: 0.96, duration: 1.4, ease: 'power2.out' },
              0.3,
            );

          /* 2. Hero depth — desktop only, scrubbed, nothing fades out. */
          const desktop = gsap.matchMedia();
          desktop.add('(min-width: 861px)', () => {
            const trigger = '[data-motion="hero"]';
            gsap.to('[data-motion="hero-logo"]', {
              y: -60,
              scale: 1.06,
              ease: 'none',
              scrollTrigger: { trigger, start: 'top top', end: 'bottom top', scrub: 0.6 },
            });
            gsap.to('[data-motion="hero-copy"]', {
              y: -24,
              ease: 'none',
              scrollTrigger: { trigger, start: 'top top', end: 'bottom top', scrub: 0.6 },
            });
          });

          /* 3. Countdown band reveals as a block; digits stay untouched. */
          gsap.from('[data-motion="clock"]', {
            opacity: 0,
            y: 16,
            duration: 0.6,
            ease: 'power3.out',
            scrollTrigger: { trigger: '[data-motion="clock"]', start: 'top 88%', once: true },
          });

          /* 5. Night curve — drawn by scroll, stops light up as the line arrives. */
          const curve = root.querySelector<SVGPathElement>('[data-motion="night-curve"] path');
          const dots = root.querySelectorAll<HTMLElement>('[data-motion="night-curve"] span');
          const stops = root.querySelectorAll<HTMLElement>('[data-motion="night-stop"]');

          if (curve && stops && stops.length > 0) {
            const length = curve.getTotalLength();
            gsap.set(curve, { strokeDasharray: length, strokeDashoffset: length });

            const draw = gsap.timeline({
              scrollTrigger: {
                trigger: '[data-motion="night-curve"]',
                start: 'top 88%',
                // Finish the draw while the band is still mid-screen, so the line
                // always reaches the 11:00 stop before the section leaves the view.
                end: 'center 62%',
                scrub: 0.5,
              },
            });
            draw.to(curve, { strokeDashoffset: 0, ease: 'none', duration: 1 });

            stops.forEach((stop, index) => {
              const dot = dots?.[index];
              const at = stops.length > 1 ? index / (stops.length - 1) : 0;
              const targets: Element[] = [stop];
              if (dot) targets.push(dot);

              draw.fromTo(
                targets,
                { opacity: 0.35 },
                { opacity: 1, duration: 0.2, ease: 'power1.out' },
                at,
              );
              if (dot) {
                draw.fromTo(
                  dot,
                  { scale: 1 },
                  { scale: 1.15, duration: 0.2, ease: 'power1.out' },
                  at,
                );
              }
            });
          }

          /* 6. Challenge cards, path steps, roles and the closing CTA. */
          gsap.from('[data-motion="challenge"]', {
            opacity: 0,
            y: 28,
            duration: 0.8,
            stagger: 0.12,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: '[data-motion-group="challenges"]',
              start: 'top 82%',
              once: true,
            },
          });

          gsap.from('[data-motion="path-step"]', {
            opacity: 0,
            y: 16,
            duration: 0.5,
            stagger: 0.06,
            ease: 'power3.out',
            scrollTrigger: { trigger: '[data-motion="path-line"]', start: 'top 82%', once: true },
          });

          gsap.from('[data-motion="role"]', {
            opacity: 0,
            y: 24,
            duration: 0.7,
            stagger: 0.1,
            ease: 'power3.out',
            scrollTrigger: { trigger: '[data-motion="role"]', start: 'top 86%', once: true },
          });

          gsap.from('[data-motion="final"] > *', {
            opacity: 0,
            y: 20,
            duration: 0.7,
            stagger: 0.08,
            ease: 'power3.out',
            scrollTrigger: { trigger: '[data-motion="final"]', start: 'top 86%', once: true },
          });
        }, root);
      } catch {
        // Any failure: remove every inline style and show the page as static.
        ctx?.revert();
        ctx = null;
      }
    }

    void setup();

    return () => {
      cancelled = true;
      try {
        ctx?.revert();
      } catch {
        /* ignore — the page is already static */
      }
      for (const dispose of teardown.reverse()) {
        try {
          dispose();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return null;
}
