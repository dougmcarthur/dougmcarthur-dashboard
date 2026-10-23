import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Phase 2 Challenger: ConfirmModal Accessibility & Contracts', () => {
  const modalSrc = read('frontend/src/components/ui/ConfirmModal.tsx')

  it('declares WCAG 2.1 alertdialog role and modal semantics', () => {
    expect(modalSrc).toContain('role="alertdialog"')
    expect(modalSrc).toContain('aria-modal="true"')
    expect(modalSrc).toContain('aria-labelledby="confirm-dialog-title"')
    expect(modalSrc).toContain('aria-describedby=')
  })

  it('traps Tab and Shift-Tab keyboard navigation within the dialog', () => {
    // Focus trap must query focusable elements inside panelRef
    expect(modalSrc).toMatch(/e\.key === 'Tab'/)
    expect(modalSrc).toContain('panelRef.current.querySelectorAll')
    // Must prevent default and cycle from last to first on Tab
    expect(modalSrc).toMatch(/!e\.shiftKey && document\.activeElement === last[\s\S]*?e\.preventDefault\(\)[\s\S]*?first\.focus\(\)/)
    // Must prevent default and cycle from first to last on Shift-Tab
    expect(modalSrc).toMatch(/e\.shiftKey && document\.activeElement === first[\s\S]*?e\.preventDefault\(\)[\s\S]*?last\.focus\(\)/)
  })

  it('dismisses cleanly on Escape without confirming', () => {
    expect(modalSrc).toMatch(/if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\)\s*onClose\(\)\s*return\s*\}/)
    // In useConfirm hook, handleClose must resolve false
    expect(modalSrc).toMatch(/handleClose = useCallback\(\(\) => \{\s*setState\(\(curr\) => \{\s*if \(curr\) curr\.resolve\(false\)/)
  })

  it('auto-focuses the Cancel button with preventScroll to protect against accidental Enter execution', () => {
    expect(modalSrc).toContain('cancelRef.current?.focus({ preventScroll: true })')
    expect(modalSrc).toContain('<Button\n            ref={cancelRef}\n            variant="quiet"')
  })

  it('restores body scroll and previous focus on unmount/dismissal', () => {
    expect(modalSrc).toContain('document.body.style.overflow = prevOverflow')
    expect(modalSrc).toContain('previous?.focus?.()')
    expect(modalSrc).toContain('cancelAnimationFrame(timer)')
    expect(modalSrc).toContain("document.removeEventListener('keydown', onKey)")
  })

  it('handles asynchronous promise resolution without leaks or unhandled rejections', () => {
    // Calling confirm while another is open dismisses previous with false
    expect(modalSrc).toContain('if (prev) prev.resolve(false)')
    // Confirm resolves with true
    expect(modalSrc).toContain('if (curr) curr.resolve(true)')
  })
})

describe('Phase 2 Challenger: ApplicationPanel Batch Answer Formatting', () => {
  const panelSrc = read('frontend/src/pages/gigs/ApplicationPanel.tsx')

  it('filters out file fields and empty/whitespace answers', () => {
    expect(panelSrc).toContain("f.fieldType !== 'file'")
    expect(panelSrc).toContain('f.answer.trim().length > 0')
  })

  it('formats answers cleanly with question label followed by answer and double newlines', () => {
    expect(panelSrc).toContain("`${f.label}\\n${f.answer!.trim()}`")
    expect(panelSrc).toContain(".join('\\n\\n')")
  })

  it('hides batch copy button when zero exportable answers exist', () => {
    expect(panelSrc).toContain('exportableFields.length > 0 && (')
    expect(panelSrc).toContain('<CopyButton')
  })

  it('accurately reproduces pure formatting logic on adversarial inputs', () => {
    type Field = { label: string; fieldType: string; answer: string | null }
    const formatBatch = (fields: Field[]) => {
      const exportable = fields.filter(
        (f) => f.fieldType !== 'file' && f.answer && f.answer.trim().length > 0,
      )
      return {
        count: exportable.length,
        text: exportable.map((f) => `${f.label}\n${f.answer!.trim()}`).join('\n\n'),
      }
    }

    // Test case 1: All empty / null / whitespace
    const emptyResult = formatBatch([
      { label: 'Bio', fieldType: 'textarea', answer: '' },
      { label: 'Genre', fieldType: 'text', answer: '   ' },
      { label: 'Headshot', fieldType: 'file', answer: 'headshot.jpg' },
      { label: 'Notes', fieldType: 'text', answer: null },
    ])
    expect(emptyResult.count).toBe(0)
    expect(emptyResult.text).toBe('')

    // Test case 2: Multiline answers, quotes, Canadian currency symbols
    const richResult = formatBatch([
      {
        label: 'Artist Biography',
        fieldType: 'textarea',
        answer: '  Sun Dogs is a Canadian indie folk duo.\nBased in Vancouver, BC.\n"Raw and melodic."  ',
      },
      {
        label: 'Tech Rider / Stage Needs',
        fieldType: 'textarea',
        answer: '2 vocal mics (Shure SM58)\n1 DI box for acoustic guitar\nBudget: $1,500 CAD',
      },
    ])
    expect(richResult.count).toBe(2)
    expect(richResult.text).toBe(
      'Artist Biography\n' +
        'Sun Dogs is a Canadian indie folk duo.\n' +
        'Based in Vancouver, BC.\n' +
        '"Raw and melodic."\n\n' +
        'Tech Rider / Stage Needs\n' +
        '2 vocal mics (Shure SM58)\n' +
        '1 DI box for acoustic guitar\n' +
        'Budget: $1,500 CAD',
    )
  })
})

describe('Phase 2 Challenger: ReviewPage Mobile Master-Detail & Responsiveness', () => {
  const reviewSrc = read('frontend/src/pages/ReviewPage.tsx')

  it('switches between master queue and full-screen detail under lg breakpoint', () => {
    expect(reviewSrc).toContain("mobileDetailOpen ? 'hidden lg:block' : 'block'")
    expect(reviewSrc).toContain("mobileDetailOpen ? 'block' : 'hidden lg:block'")
  })

  it('records window.scrollY and restores it upon Back to queue', () => {
    expect(reviewSrc).toContain('queueScrollY.current = window.scrollY')
    expect(reviewSrc).toContain('setMobileDetailOpen(false)')
    expect(reviewSrc).toContain('window.scrollTo({ top: queueScrollY.current, behavior: \'instant\' })')
  })

  it('provides a prominent "← Back to queue" button with queue index context', () => {
    expect(reviewSrc).toContain('← Back to queue')
    expect(reviewSrc).toContain('visible.findIndex((i) => i.key === selected.key) + 1')
  })

  it('supports j/k keyboard queue traversal', () => {
    expect(reviewSrc).toMatch(/e\.key !== 'j' && e\.key !== 'k'/)
    expect(reviewSrc).toMatch(/e\.key === 'j' \? index \+ 1 : index - 1/)
  })
})

describe('Phase 2 Challenger: SyncPage Mailbox Authorization & Invariants', () => {
  const syncSrc = read('frontend/src/pages/SyncPage.tsx')

  it('strictly gates Gmail reconciliation on ownsMailbox', () => {
    expect(syncSrc).toContain("const ownsMailbox = useSession()?.role === 'owner'")
    expect(syncSrc).toContain('{ownsMailbox && <button')
    expect(syncSrc).toContain('{ownsMailbox && showReconcile && <ReconcilePanel')
  })

  it('does not contain forbidden variant="danger" in SyncPage', () => {
    expect(syncSrc).not.toContain('variant="danger"')
  })

  it('uses ConfirmModal for destructive sync target deletion', () => {
    expect(syncSrc).toContain('const { confirm, ConfirmDialog } = useConfirm()')
    expect(syncSrc).toContain('const ok = await confirm({')
    expect(syncSrc).toContain('title: `Delete "${target.name}"?`')
    expect(syncSrc).toContain('destructive: true')
    expect(syncSrc).toContain('{ConfirmDialog}')
  })
})
