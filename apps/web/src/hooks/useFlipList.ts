import { useLayoutEffect, useRef } from 'react'

// Animates reordering of a list using the FLIP technique (First, Last, Invert,
// Play). Attach the returned ref to the list container and give each direct
// child a stable `data-flip-key`. Whenever a child ends up in a new vertical
// slot (e.g. a completed exercise sinking to the bottom), it glides there
// instead of jumping.
//
// There is no animation library in this app, so this leans on the Web
// Animations API and the same motion feel as the CSS tokens (`--dur-base` /
// `--ease`). `prefers-reduced-motion` is honored — positions are still tracked,
// but no movement is played.
export function useFlipList<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const positions = useRef<Map<string, number>>(new Map())

  // Runs after every commit so the recorded positions stay in sync with the
  // real layout even when rows resize (e.g. logging a set grows a card). That
  // keeps the invert offset accurate the next time the order actually changes.
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const containerTop = container.getBoundingClientRect().top
    const next = new Map<string, number>()

    for (const child of Array.from(container.children) as HTMLElement[]) {
      const key = child.dataset.flipKey
      if (!key) continue

      // Position relative to the container, so page scroll or the container
      // itself moving doesn't register as a row moving.
      const top = child.getBoundingClientRect().top - containerTop
      next.set(key, top)

      const prevTop = positions.current.get(key)
      // `animate` guard covers environments without the Web Animations API
      // (older browsers, jsdom) — positions are still tracked, motion is skipped.
      if (reduceMotion || prevTop == null || typeof child.animate !== 'function') continue

      const delta = prevTop - top
      if (Math.abs(delta) < 1) continue

      // Invert to the old spot, then play back to the new one.
      child.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
        { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      )
    }

    positions.current = next
  })

  return ref
}
