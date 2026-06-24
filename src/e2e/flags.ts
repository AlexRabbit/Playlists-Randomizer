import type { VideoEntry } from '@/core/models/workspace';

/** Fixed mock catalog for Playwright runs (VITE_E2E=1). */
export const E2E_MOCK_VIDEOS: VideoEntry[] = [
  { videoId: 'e2eVideo000001', title: 'E2E Test Track One', playlistId: 'PLtest123456789' },
  { videoId: 'e2eVideo000002', title: 'E2E Test Track Two', playlistId: 'PLtest123456789' },
];

export function isE2E(): boolean {
  return import.meta.env.VITE_E2E === '1';
}
