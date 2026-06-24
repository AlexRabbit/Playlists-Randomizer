import { describe, it, expect } from 'vitest';
import { createId } from '@/core/models/workspace';

describe('workspace models', () => {
  it('creates unique ids', () => {
    const a = createId();
    const b = createId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(5);
  });
});
