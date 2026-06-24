import { describe, it, expect } from 'vitest';
import {
  parsePlaylistId,
  parsePlaylistIdsFromText,
  isInnertubeOnlyPlaylistId,
  normalizePlaylistIds,
} from '@/core/youtube/playlist';

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

  it('parses user show URL with sbp query', () => {
    const url =
      'https://www.youtube.com/show/VLPLNbV3GXqg9TPnqNVN3f1mAZE1IxnURN8S?sbp=QAE%253D';
    expect(parsePlaylistId(url)).toBe('VLPLNbV3GXqg9TPnqNVN3f1mAZE1IxnURN8S');
  });

  it('parses podcast URL same as show', () => {
    const url = 'https://www.youtube.com/podcast/VLPLabc123xyz?sbp=foo';
    expect(parsePlaylistId(url)).toBe('VLPLabc123xyz');
    expect(isInnertubeOnlyPlaylistId('VLPLabc123xyz')).toBe(true);
  });

  it('does not treat bare video ids as playlists', () => {
    expect(parsePlaylistId('dQw4w9WgXcQ')).toBeNull();
  });
});

describe('isInnertubeOnlyPlaylistId', () => {
  it('flags VLPL show playlists', () => {
    expect(isInnertubeOnlyPlaylistId('VLPLNbV3GXqg9TPnqNVN3f1mAZE1IxnURN8S')).toBe(true);
    expect(isInnertubeOnlyPlaylistId('PLNbV3GXqg9TNjveYH22HWZkFOSuAdSfWG')).toBe(true);
    expect(isInnertubeOnlyPlaylistId('PLrAXtmRdnEQy6nuLMH8pKxXpi0')).toBe(false);
  });
});

describe('normalizePlaylistIds', () => {
  it('re-parses stored URLs and dedupes', () => {
    expect(
      normalizePlaylistIds([
        'https://www.youtube.com/show/VLPLNbV3GXqg9TPnqNVN3f1mAZE1IxnURN8S?sbp=QAE%253D',
        'VLPLNbV3GXqg9TPnqNVN3f1mAZE1IxnURN8S',
      ])
    ).toEqual(['VLPLNbV3GXqg9TPnqNVN3f1mAZE1IxnURN8S']);
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
