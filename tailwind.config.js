/** @type {import('tailwindcss').Config} */
export default {
  content: ['./frontend/index.html', './frontend/src/**/*.{ts,tsx}'],
  // Every colour below resolves to a CSS variable, so a theme switch is a
  // variable swap rather than a `dark:` class on every element. The selector is
  // still declared for the few places that need to diverge structurally rather
  // than chromatically (shadow treatments, mostly).
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
        canvas: 'var(--c-canvas)',
        surface: 'var(--c-surface)',
        raised: 'var(--c-raised)',
        sunken: 'var(--c-sunken)',
        line: 'var(--c-line)',
        'line-strong': 'var(--c-line-strong)',
        ink: 'var(--c-ink)',
        body: 'var(--c-body)',
        muted: 'var(--c-muted)',
        faint: 'var(--c-faint)',
        accent: 'var(--c-accent)',
        'accent-hover': 'var(--c-accent-hover)',
        'accent-fg': 'var(--c-accent-fg)',
        'accent-soft': 'var(--c-accent-soft)',
        'danger-bg': 'var(--c-danger-bg)',
        'danger-bg-hover': 'var(--c-danger-bg-hover)',
        'danger-line': 'var(--c-danger-line)',
        'danger-fg': 'var(--c-danger-fg)',
        'danger-solid': 'var(--c-danger-solid)',
        'success-bg': 'var(--c-success-bg)',
        'success-bg-hover': 'var(--c-success-bg-hover)',
        'success-line': 'var(--c-success-line)',
        'success-fg': 'var(--c-success-fg)',
        'success-solid': 'var(--c-success-solid)',
        'warn-bg': 'var(--c-warn-bg)',
        'warn-line': 'var(--c-warn-line)',
        'warn-fg': 'var(--c-warn-fg)',
        'info-bg': 'var(--c-info-bg)',
        'info-bg-hover': 'var(--c-info-bg-hover)',
        'info-line': 'var(--c-info-line)',
        'info-fg': 'var(--c-info-fg)',
        'cat-violet-bg': 'var(--c-cat-violet-bg)',
        'cat-violet-line': 'var(--c-cat-violet-line)',
        'cat-violet-fg': 'var(--c-cat-violet-fg)',
        'cat-sky-bg': 'var(--c-cat-sky-bg)',
        'cat-sky-line': 'var(--c-cat-sky-line)',
        'cat-sky-fg': 'var(--c-cat-sky-fg)',
        'cat-teal-bg': 'var(--c-cat-teal-bg)',
        'cat-teal-line': 'var(--c-cat-teal-line)',
        'cat-teal-fg': 'var(--c-cat-teal-fg)',
        'cat-orange-bg': 'var(--c-cat-orange-bg)',
        'cat-orange-line': 'var(--c-cat-orange-line)',
        'cat-orange-fg': 'var(--c-cat-orange-fg)',
        'cat-rose-bg': 'var(--c-cat-rose-bg)',
        'cat-rose-line': 'var(--c-cat-rose-line)',
        'cat-rose-fg': 'var(--c-cat-rose-fg)',
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
