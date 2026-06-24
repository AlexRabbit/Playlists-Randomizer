import { describe, it, expect } from 'vitest';
import {
  encodeWorkspace,
  decodeWorkspace,
  parseLegacyPid,
  buildBookmarkUrl,
} from '@/core/url-state/codec';
import { createEmptyWorkspace, createList, createCard } from '@/core/models/workspace';

describe('URL state codec', () => {
  it('roundtrips full workspace including settings and playback state', () => {
    const ws = createEmptyWorkspace();
    const asmr = createList('ASMR');
    const music = createList('MUSIC');
    const card = createCard('Mouth sounds');
    card.playlistIds = ['PLabc1234567890', 'PLdef1234567890'];
    card.settings = { random: false, showVideo: true, noAds: false, autoplayNext: false };
    card.shuffleSeed = 12345;
    card.currentVideoIndex = 7;
    asmr.cards.push(card);
    music.cards.push(createCard('Rock'));
    music.cards[0].playlistIds = ['PLrock123456789'];
    ws.lists.push(asmr, music);
    ws.activeListId = music.id;

    const dec = decodeWorkspace(encodeWorkspace(ws))!;
    expect(dec.lists).toHaveLength(2);
    expect(dec.activeListId).toBe(music.id);
    expect(dec.lists[0].cards[0].settings).toEqual({
      random: false,
      showVideo: true,
      noAds: false,
      autoplayNext: false,
    });
    expect(dec.lists[0].cards[0].shuffleSeed).toBe(12345);
    expect(dec.lists[0].cards[0].currentVideoIndex).toBe(7);
    expect(dec.lists[1].cards[0].playlistIds).toEqual(['PLrock123456789']);
  });

  it('fills missing settings on decode (old bookmarks)', () => {
    const raw = {
      version: 1,
      lists: [
        {
          id: 'l1',
          name: 'Test',
          cards: [{ id: 'c1', name: 'Card', playlistIds: ['PLxxxxxxxxxx'] }],
        },
      ],
      activeListId: 'l1',
    };
    const dec = decodeWorkspace(encodeWorkspace(raw as never))!;
    expect(dec.lists[0].cards[0].settings.random).toBe(true);
    expect(dec.lists[0].cards[0].settings.noAds).toBe(true);
    expect(dec.lists[0].cards[0].currentVideoIndex).toBe(0);
  });

  it('returns null for garbage', () => {
    expect(decodeWorkspace('not-valid')).toBeNull();
  });

  it('parses legacy pid format', () => {
    const q = '?pid=PLaaa~:-PLbbb~:-PLccc';
    expect(parseLegacyPid(q)).toEqual(['PLaaa', 'PLbbb', 'PLccc']);
  });

  it('handles empty workspace', () => {
    const ws = createEmptyWorkspace();
    const dec = decodeWorkspace(encodeWorkspace(ws));
    expect(dec?.lists).toEqual([]);
  });

  it('buildBookmarkUrl includes ws param when workspace has data', () => {
    const ws = createEmptyWorkspace();
    const list = createList('ASMR');
    list.cards.push(createCard('Test'));
    list.cards[0].playlistIds = ['PLtest1234567890'];
    ws.lists.push(list);
    ws.activeListId = list.id;

    const url = buildBookmarkUrl(ws);
    expect(url).toMatch(/[?#].*ws=/);
    const restored = decodeWorkspace(new URL(url).searchParams.get('ws') || '');
    expect(restored?.lists[0].name).toBe('ASMR');
  });
});
