import type { PlaylistTruncation } from '@/core/youtube/playlist';
import { showToast } from '@/app/toast';
import { t } from '@/i18n';

export function notifyPlaylistTruncation(truncated: PlaylistTruncation[]): void {
  if (!truncated.length) return;
  const first = truncated[0];
  showToast(
    t('playlistTruncated', {
      loaded: first.loaded,
      total: first.total ?? '?',
    })
  );
}
