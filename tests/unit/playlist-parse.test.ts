import { describe, it, expect } from 'vitest';
import { parsePlaylistId, parsePlaylistIdsFromText } from '@/core/youtube/playlist';

describe('parsePlaylistId', () => {
  it('parses standard playlist URL', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLabc123xyz0')).toBe('PLabc123xyz0');
  });

  it('parses YouTube show / VLPL URL', () => {
    const url =
      'https://www.youtube.com/show/VLPLNbV3GXqg9TNOr0pC9knjt77fIR6MrEce?sbp=KgtzUnRGQlN4NlFCNEAB';
    expect(parsePlaylistId(url)).toBe('VLPLNbV3GXqg9TNOr0pC9knjt77fIR6MrEce');
  });

  it('parses bare VLPL id', () => {
    expect(parsePlaylistId('VLPLNbV3GXqg9TNOr0pC9knjt77fIR6MrEce')).toBe(
      'VLPLNbV3GXqg9TNOr0pC9knjt77fIR6MrEce'
    );
  });
});

describe('parsePlaylistIdsFromText', () => {
  it('extracts multiple ids from lines', () => {
    const text = `PLaaa
https://www.youtube.com/show/VLPLNbV3GXqg9TNOr0pC9knjt77fIR6MrEce`;
    expect(parsePlaylistIdsFromText(text)).toEqual([
      'PLaaa',
      'VLPLNbV3GXqg9TNOr0pC9knjt77fIR6MrEce',
    ]);
  });
});
