import { describe, it, expect } from 'vitest';
import { parsePlaylistId, parsePlaylistIdsFromText, shuffleVideos } from '@/core/youtube/playlist';

describe('playlist parsing', () => {
  it('extracts ID from full URL', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLov5CmIKRp-MgyOOcw')).toBe(
      'PLov5CmIKRp-MgyOOcw'
    );
  });

  it('accepts raw ID', () => {
    expect(parsePlaylistId('PLov5CmIKRp-MgyOOcw-c-vzxQh12qYoBr')).toBe(
      'PLov5CmIKRp-MgyOOcw-c-vzxQh12qYoBr'
    );
  });

  it('rejects empty and invalid', () => {
    expect(parsePlaylistId('')).toBeNull();
    expect(parsePlaylistId('not a playlist')).toBeNull();
  });

  it('parses multiline text', () => {
    const text = `
      https://www.youtube.com/playlist?list=PLaaa1234567
      PLbbb1234567
      garbage line
    `;
    expect(parsePlaylistIdsFromText(text)).toEqual(['PLaaa1234567', 'PLbbb1234567']);
  });
});

describe('shuffleVideos', () => {
  it('is deterministic with seed', () => {
    const items = [1, 2, 3, 4, 5];
    const a = shuffleVideos(items, 42);
    const b = shuffleVideos(items, 42);
    expect(a).toEqual(b);
    expect(a).not.toEqual(items);
  });

  it('handles empty', () => {
    expect(shuffleVideos([])).toEqual([]);
  });
});
