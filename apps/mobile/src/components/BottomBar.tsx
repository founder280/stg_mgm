/**
 * The four actions the form spec places at the bottom of every data-entry
 * screen: New Walk-in, Summary, Save and Forward, Waiting Pts.
 */
export function BottomBar({
  onNew,
  onSummary,
  onSaveForward,
  onWaiting,
  waitingCount,
  saveLabel = 'Save & forward',
  canSave = true,
  saving = false,
}: {
  onNew: () => void;
  onSummary: () => void;
  onSaveForward: () => void;
  onWaiting: () => void;
  waitingCount: number;
  saveLabel?: string;
  canSave?: boolean;
  saving?: boolean;
}) {
  return (
    <nav className="bottombar" aria-label="Camp actions">
      <button type="button" onClick={onNew}>
        <span className="glyph" aria-hidden>＋</span>
        New walk-in
      </button>
      <button type="button" onClick={onSummary}>
        <span className="glyph" aria-hidden>▤</span>
        Summary
      </button>
      <button type="button" className="accent" onClick={onSaveForward} disabled={!canSave || saving}>
        <span className="glyph" aria-hidden>➜</span>
        {saving ? 'Saving…' : saveLabel}
      </button>
      <button type="button" onClick={onWaiting}>
        <span className="glyph" aria-hidden>⏱</span>
        Waiting
        {waitingCount > 0 && <span className="badge">{waitingCount}</span>}
      </button>
    </nav>
  );
}
