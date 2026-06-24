import { describe, it, expect } from 'vitest';
import { normalizeWorkspace } from '@/core/models/normalize';

describe('normalizeWorkspace', () => {
  it('repairs missing card settings and active list', () => {
    const ws = normalizeWorkspace({
      version: 1,
      lists: [
        { id: 'a', name: 'A', cards: [{ id: 'c', name: 'C', playlistIds: ['PL1234567890'], settings: { random: true, showVideo: false, noAds: true, autoplayNext: true } }] },
      ],
      activeListId: 'missing-id',
    });
    expect(ws.activeListId).toBe('a');
    expect(ws.lists[0].cards[0].settings.random).toBe(true);
  });
});
