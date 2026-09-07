import { useState } from 'react'
import type { ArtistAssetInput, ArtistAssetWithHealth } from '../../api'
import { ASSET_KINDS, ASSET_KIND_META, assetKindMeta } from '../../../../shared/artistAssets'
import { QUESTION_KINDS } from '../../../../shared/questionKinds'
import { FIELD } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'

/** Add or edit one entry. Same form either way — the fields do not differ. */
export function AssetForm({
  asset,
  onSave,
  onCancel,
  isSaving,
}: {
  asset?: ArtistAssetWithHealth
  onSave: (body: ArtistAssetInput) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [draft, setDraft] = useState({
    kind: asset?.kind ?? 'bio',
    label: asset?.label ?? '',
    value: asset?.value ?? '',
    questionKind: asset?.questionKind ?? '',
    variant: asset?.variant ?? '',
    credit: asset?.credit ?? '',
    usageRights: asset?.usageRights ?? '',
    // Left blank on a new entry: the server fills it from the kind's own
    // interval, so nothing lands here without a date it comes back on.
    reviewBy: asset?.reviewBy ?? '',
    source: asset?.source ?? '',
    notes: asset?.notes ?? '',
  })
  const set = (k: keyof typeof draft, v: string) => setDraft((d) => ({ ...d, [k]: v }))
  const meta = assetKindMeta(draft.kind)

  return (
    <div className="space-y-3 p-4 bg-sunken border border-line rounded-xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Kind</label>
          <select value={draft.kind} onChange={(e) => set('kind', e.target.value)} className={FIELD}>
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>{ASSET_KIND_META[k].label}</option>
            ))}
          </select>
          <p className="text-xs text-faint mt-1">{meta.meaning}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Label</label>
          <input value={draft.label} onChange={(e) => set('label', e.target.value)} className={FIELD}
            placeholder={meta.isLink ? 'Live at the Park Theatre' : 'Long bio'} />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">
            {meta.isLink ? 'URL' : 'Text'}
          </label>
          {meta.isLink ? (
            <input type="url" value={draft.value} onChange={(e) => set('value', e.target.value)} className={FIELD} />
          ) : (
            <textarea rows={5} value={draft.value} onChange={(e) => set('value', e.target.value)}
              className={`${FIELD} resize-y`} />
          )}
          {!meta.isLink && draft.value && (
            <p className="text-xs text-faint mt-1 tabular-nums">{draft.value.length} characters</p>
          )}
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">
            Answers the question <span className="text-faint font-normal">— what a form is asking when it asks for this</span>
          </label>
          <select value={draft.questionKind} onChange={(e) => set('questionKind', e.target.value)} className={FIELD}>
            <option value="">—</option>
            {QUESTION_KINDS.map((q) => (
              <option key={q.key} value={q.key}>{q.label}</option>
            ))}
          </select>
        </div>

        {meta.needsCredit && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Photographer credit</label>
              <input value={draft.credit} onChange={(e) => set('credit', e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Usage rights</label>
              <input value={draft.usageRights} onChange={(e) => set('usageRights', e.target.value)} className={FIELD}
                placeholder="Press use, credit required" />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Review by <span className="text-faint font-normal">— blank for {meta.reviewMonths} months</span>
          </label>
          <input type="date" value={draft.reviewBy} onChange={(e) => set('reviewBy', e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Where it came from</label>
          <input value={draft.source} onChange={(e) => set('source', e.target.value)} className={FIELD}
            placeholder="Drive, the 2026 EPK" />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Notes</label>
          <input value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={FIELD} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={isSaving || !draft.label.trim()}
          onClick={() =>
            onSave({
              kind: draft.kind,
              label: draft.label.trim(),
              value: draft.value || null,
              questionKind: draft.questionKind || null,
              variant: draft.variant || null,
              credit: draft.credit || null,
              usageRights: draft.usageRights || null,
              reviewBy: draft.reviewBy || null,
              source: draft.source || null,
              notes: draft.notes || null,
            })
          }
        >
          {isSaving ? 'Saving…' : asset ? 'Save' : 'Add'}
        </Button>
        <Button variant="neutral" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
