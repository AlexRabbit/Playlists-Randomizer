import { bindHaptic } from '@/ui/haptics';

export function setupDragReorder<T extends { id: string }>(
  container: HTMLElement,
  items: T[],
  onReorder: (from: number, to: number) => void,
  renderItem: (item: T, index: number, handle: HTMLElement) => HTMLElement
): void {
  container.innerHTML = '';
  items.forEach((item, index) => {
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    handle.draggable = true;

    const row = renderItem(item, index, handle);
    row.dataset.index = String(index);
    row.classList.add('draggable-row');

    handle.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', String(index));
      row.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => row.classList.remove('dragging'));

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drop-target');
      const from = Number(e.dataTransfer?.getData('text/plain'));
      const to = index;
      if (!Number.isNaN(from) && from !== to) onReorder(from, to);
    });

    bindHaptic(row);
    container.appendChild(row);
  });
}
