import { parsePlaylistIdsFromText } from '@/core/youtube/playlist';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';

export function openBulkPasteModal(onApply: (ids: string[]) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal glass';

  const h = document.createElement('h2');
  h.textContent = t('bulkPasteTitle');
  const hint = document.createElement('p');
  hint.className = 'modal-hint';
  hint.textContent = t('bulkPasteHint');

  const ta = document.createElement('textarea');
  ta.className = 'card-edit';
  ta.rows = 12;

  const countEl = document.createElement('p');
  countEl.className = 'modal-count';

  const updateCount = () => {
    const ids = parsePlaylistIdsFromText(ta.value);
    countEl.textContent = t('bulkPasteCount', { count: ids.length });
  };
  ta.addEventListener('input', updateCount);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const apply = document.createElement('button');
  apply.className = 'btn btn-primary';
  apply.textContent = t('bulkPasteApply');
  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.textContent = t('cancel');

  const close = () => overlay.remove();
  cancel.onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  apply.onclick = () => {
    const ids = parsePlaylistIdsFromText(ta.value);
    onApply(ids);
    close();
  };

  bindHaptic(apply);
  bindHaptic(cancel);
  actions.append(apply, cancel);
  modal.append(h, hint, ta, countEl, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  ta.focus();
  updateCount();
}
