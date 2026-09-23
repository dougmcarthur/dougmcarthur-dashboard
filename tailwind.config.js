/** @type {import('tailwindcss').Config} */
export default {
  content: ['./frontend/index.html', './frontend/src/**/*.{ts,tsx}'],
  // Every colour below resolves to a CSS variable, so a theme switch is a
  // variable swap rather than a `dark:` class on every element. The selector is
  // still declared for the few places that need to diverge structurally rather
  // than chromatically (shadow treatments, mostly).
  //
  // Each colour carries `<alpha-value>` so `bg-canvas/90` works. Without it
  // Tailwind cannot apply an opacity modifier and emits no rule for the class,
  // which builds and renders as a transparent element; test/uiConsistency.test.ts
  // fails on a colour here that lacks it.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      /*
       * The type ramp, moved up a step.
       *
       * This app uses `text-xs` as its body size — 297 uses against 139 of
       * `text-sm` — so twelve pixels was not an exception for badges, it was
       * the paragraph size, and the modal was the place that made it obvious.
       *
       * Changing 297 class strings would be the kind of sweep that typechecks,
       * renders, and quietly breaks a dozen dense layouts. Redefining what the
       * names mean moves everything at once, in proportion, with no JSX churn
       * and nothing to get wrong one file at a time.
       *
       * Line heights are declared with each size because supplying a fontSize
       * without one drops Tailwind's paired default and leaves prose set solid.
       */
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],   // 13px, was 12
        sm: ['0.9375rem', { lineHeight: '1.375rem' }],   // 15px, was 14
        base: ['1.0625rem', { lineHeight: '1.625rem' }], // 17px, was 16
        lg: ['1.1875rem', { lineHeight: '1.75rem' }],    // 19px, was 18
        xl: ['1.375rem', { lineHeight: '1.875rem' }],    // 22px, was 20
        '2xl': ['1.625rem', { lineHeight: '2.125rem' }], // 26px, was 24
        '3xl': ['2rem', { lineHeight: '2.375rem' }],     // 32px, was 30
      },
      screens: {
        // Tailwind stops at 1536px. Displays do not.
        '3xl': '1920px',
        '4xl': '2560px',
      },
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        sunken: 'rgb(var(--c-sunken) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        body: 'rgb(var(--c-body) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--c-accent-hover) / <alpha-value>)',
        'accent-fg': 'rgb(var(--c-accent-fg) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        'danger-bg': 'rgb(var(--c-danger-bg) / <alpha-value>)',
        'danger-bg-hover': 'rgb(var(--c-danger-bg-hover) / <alpha-value>)',
        'danger-line': 'rgb(var(--c-danger-line) / <alpha-value>)',
        'danger-fg': 'rgb(var(--c-danger-fg) / <alpha-value>)',
        'danger-solid': 'rgb(var(--c-danger-solid) / <alpha-value>)',
        'success-bg': 'rgb(var(--c-success-bg) / <alpha-value>)',
        'success-bg-hover': 'rgb(var(--c-success-bg-hover) / <alpha-value>)',
        'success-line': 'rgb(var(--c-success-line) / <alpha-value>)',
        'success-fg': 'rgb(var(--c-success-fg) / <alpha-value>)',
        'success-solid': 'rgb(var(--c-success-solid) / <alpha-value>)',
        'warn-bg': 'rgb(var(--c-warn-bg) / <alpha-value>)',
        'warn-line': 'rgb(var(--c-warn-line) / <alpha-value>)',
        'warn-fg': 'rgb(var(--c-warn-fg) / <alpha-value>)',
        'info-bg': 'rgb(var(--c-info-bg) / <alpha-value>)',
        'info-bg-hover': 'rgb(var(--c-info-bg-hover) / <alpha-value>)',
        'info-line': 'rgb(var(--c-info-line) / <alpha-value>)',
        'info-fg': 'rgb(var(--c-info-fg) / <alpha-value>)',
        'cat-violet-bg': 'rgb(var(--c-cat-violet-bg) / <alpha-value>)',
        'cat-violet-line': 'rgb(var(--c-cat-violet-line) / <alpha-value>)',
        'cat-violet-fg': 'rgb(var(--c-cat-violet-fg) / <alpha-value>)',
        'cat-sky-bg': 'rgb(var(--c-cat-sky-bg) / <alpha-value>)',
        'cat-sky-line': 'rgb(var(--c-cat-sky-line) / <alpha-value>)',
        'cat-sky-fg': 'rgb(var(--c-cat-sky-fg) / <alpha-value>)',
        'cat-teal-bg': 'rgb(var(--c-cat-teal-bg) / <alpha-value>)',
        'cat-teal-line': 'rgb(var(--c-cat-teal-line) / <alpha-value>)',
        'cat-teal-fg': 'rgb(var(--c-cat-teal-fg) / <alpha-value>)',
        'cat-orange-bg': 'rgb(var(--c-cat-orange-bg) / <alpha-value>)',
        'cat-orange-line': 'rgb(var(--c-cat-orange-line) / <alpha-value>)',
        'cat-orange-fg': 'rgb(var(--c-cat-orange-fg) / <alpha-value>)',
        'cat-rose-bg': 'rgb(var(--c-cat-rose-bg) / <alpha-value>)',
        'cat-rose-line': 'rgb(var(--c-cat-rose-line) / <alpha-value>)',
        'cat-rose-fg': 'rgb(var(--c-cat-rose-fg) / <alpha-value>)',
      },
      fontFamily: {
        sans: 'var(--font-ui)',
        mono: 'var(--font-mono)',
      },
      boxShadow: {
        // Depth is a token because dark surfaces need light borders where light
        // surfaces need cast shadows — the same elevation, a different device.
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        pop: 'var(--shadow-pop)',
        inset: 'var(--shadow-inset)',
      },
      maxWidth: {
        shell: 'var(--shell-width)',
      },
      transitionDuration: {
        DEFAULT: 'var(--motion-fast)',
      },
    },
  },
  plugins: [],
}
