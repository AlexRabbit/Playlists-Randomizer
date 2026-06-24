import type { VideoEntry } from '@/core/models/workspace';
import { youtubeThumbUrl } from '@/core/models/workspace';
import { bindHaptic } from '@/ui/haptics';
import { t } from '@/i18n';
import { setupDragReorder } from './drag-reorder';

export interface PlaylistSidebarConfig {
  videos: VideoEntry[];
  currentIndex: number;
  onPick: (index: number) => void;
  onReorder?: (from: number, to: number) => void;
  truncated?: boolean;
  onLoadFull?: () => void;
}

type QueueRow = VideoEntry & { id: string };

let rootEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let metaEl: HTMLElement | null = null;
let nowPlayingEl: HTMLElement | null = null;
let footerEl: HTMLElement | null = null;
let loadFullBtn: HTMLButtonElement | null = null;
let open = false;
let config: PlaylistSidebarConfig | null = null;

export function initPlaylistSidebar(el: HTMLElement): void {
  rootEl = el;
  el.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'sidebar-title';
  title.textContent = t('playlistPanel');

  metaEl = document.createElement('p');
  metaEl.className = 'playlist-sidebar-meta';

  nowPlayingEl = document.createElement('div');
  nowPlayingEl.className = 'playlist-sidebar-now-playing glass-inset';
  nowPlayingEl.hidden = true;

  listEl = document.createElement('div');
  listEl.className = 'playlist-sidebar-list glass-scroll';

  footerEl = document.createElement('div');
  footerEl.className = 'playlist-sidebar-footer';
  footerEl.hidden = true;

  loadFullBtn = document.createElement('button');
  loadFullBtn.type = 'button';
  loadFullBtn.className = 'btn btn-primary playlist-sidebar-load-full';
  loadFullBtn.textContent = t('loadFullPlaylist');
  bindHaptic(loadFullBtn);
  footerEl.appendChild(loadFullBtn);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'playlist-sidebar-scroll';
  scrollWrap.append(nowPlayingEl, listEl);

  el.append(title, metaEl, scrollWrap, footerEl);
}

export function isPlaylistSidebarOpen(): boolean {
  return open;
}

export function showPlaylistSidebar(next: PlaylistSidebarConfig): void {
  if (!rootEl || !listEl) return;
  config = next;
  onOpen();
  renderAll(next);
}

export function hidePlaylistSidebar(): void {
  open = false;
  config = null;
  document.getElementById('app-body')?.classList.remove('playlist-open');
  document.body.classList.remove('playlist-open');
  rootEl?.classList.remove('is-visible');
}

export function updatePlaylistSidebar(next: PlaylistSidebarConfig): void {
  if (!open || !listEl) return;
  config = next;
  renderAll(next);
}

function onOpen(): void {
  open = true;
  document.getElementById('app-body')?.classList.add('playlist-open');
  document.body.classList.add('playlist-open');
  requestAnimationFrame(() => rootEl?.classList.add('is-visible'));
}

function renderAll(cfg: PlaylistSidebarConfig): void {
  renderNowPlaying(cfg.videos, cfg.currentIndex);
  renderMeta(cfg.videos, cfg.currentIndex);
  renderList(cfg);
  renderFooter(cfg);
}

function renderMeta(videos: VideoEntry[], currentIndex: number): void {
  if (!metaEl) return;
  metaEl.textContent = `${videos.length} videos · #${currentIndex + 1} playing`;
}

function renderNowPlaying(videos: VideoEntry[], currentIndex: number): void {
  if (!nowPlayingEl) return;
  const v = videos[currentIndex];
  if (!v) {
    nowPlayingEl.hidden = true;
    return;
  }
  nowPlayingEl.hidden = false;
  const badge = unavailableLabel(v);
  nowPlayingEl.innerHTML = `
    <span class="playlist-sidebar-now-label">${esc(t('globalPlayerLabel'))}</span>
    <div class="playlist-sidebar-now-row">
      <img src="${youtubeThumbUrl(v.videoId)}" alt="" loading="lazy" />
      <div class="playlist-sidebar-now-text">
        <span class="playlist-sidebar-now-title">${esc(v.title)}</span>
        <span class="playlist-sidebar-now-idx">${currentIndex + 1} / ${videos.length}</span>
      </div>
      ${badge ? `<span class="playlist-sidebar-badge ${badgeClass(badge)}">${esc(badge)}</span>` : ''}
    </div>`;
}

function renderFooter(cfg: PlaylistSidebarConfig): void {
  if (!footerEl || !loadFullBtn) return;
  const show = Boolean(cfg.truncated && cfg.onLoadFull);
  footerEl.hidden = !show;
  loadFullBtn.onclick = show ? () => cfg.onLoadFull?.() : null;
}

function renderList(cfg: PlaylistSidebarConfig): void {
  if (!listEl) return;
  const { videos, currentIndex, onPick, onReorder } = cfg;
  const rows: QueueRow[] = videos.map((v, i) => ({ ...v, id: `${v.videoId}-${i}` }));

  const renderRow = (item: QueueRow, index: number, handle: HTMLElement): HTMLElement => {
    handle.title = t('dragReorder');
    const row = document.createElement('div');
    row.className = 'playlist-sidebar-row' + (index === currentIndex ? ' active' : '');
    if (item.unavailable) row.classList.add('unavailable');

    const badge = unavailableLabel(item);
    const badgeHtml = badge
      ? `<span class="playlist-sidebar-badge ${badgeClass(badge)}">${esc(badge)}</span>`
      : '';

    row.innerHTML = `
      <span class="playlist-sidebar-idx">${index + 1}</span>
      <img src="${youtubeThumbUrl(item.videoId)}" alt="" loading="lazy" />
      <span class="playlist-sidebar-name">${esc(item.title)}</span>
      ${badgeHtml}`;

    row.prepend(handle);
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.drag-handle')) return;
      onPick(index);
    });

    return row;
  };

  if (onReorder && rows.length > 1) {
    setupDragReorder(listEl, rows, (from, to) => onReorder(from, to), renderRow);
  } else {
    listEl.innerHTML = '';
    rows.forEach((item, index) => {
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⠿';
      handle.hidden = true;
      const row = renderRow(item, index, handle);
      bindHaptic(row);
      listEl!.appendChild(row);
    });
  }

  const active = listEl.querySelector('.playlist-sidebar-row.active');
  active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function unavailableLabel(v: VideoEntry): string | null {
  if (!v.unavailable) return null;
  if (/private/i.test(v.title)) return t('videoPrivate');
  if (/deleted/i.test(v.title)) return t('videoDeleted');
  return t('videoUnavailable');
}

function badgeClass(label: string): string {
  if (label === t('videoPrivate')) return 'badge-private';
  if (label === t('videoDeleted')) return 'badge-deleted';
  return 'badge-unavailable';
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
