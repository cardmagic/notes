import { describe, it, expect } from 'vitest';
import { appleToUnix, appleToDate, unixToApple } from './types.js';

const APPLE_EPOCH_OFFSET = 978307200;

describe('appleToUnix', () => {
  it('converts Apple epoch 0 to Unix epoch offset', () => {
    expect(appleToUnix(0)).toBe(APPLE_EPOCH_OFFSET);
  });

  it('converts a known Apple timestamp', () => {
    // 2024-01-01 00:00:00 UTC = 1704067200 Unix
    // Apple timestamp = 1704067200 - 978307200 = 725760000
    expect(appleToUnix(725760000)).toBe(1704067200);
  });

  it('floors fractional Apple timestamps', () => {
    expect(appleToUnix(100.9)).toBe(100 + APPLE_EPOCH_OFFSET);
  });

  it('handles negative Apple timestamps (before 2001)', () => {
    expect(appleToUnix(-APPLE_EPOCH_OFFSET)).toBe(0); // Unix epoch
  });
});

describe('appleToDate', () => {
  it('converts Apple epoch 0 to Jan 1, 2001', () => {
    const date = appleToDate(0);
    expect(date.getUTCFullYear()).toBe(2001);
    expect(date.getUTCMonth()).toBe(0); // January
    expect(date.getUTCDate()).toBe(1);
  });

  it('returns a valid Date object', () => {
    const date = appleToDate(725760000);
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBe(1704067200 * 1000);
  });
});

describe('unixToApple', () => {
  it('converts Unix epoch 0 to negative Apple timestamp', () => {
    expect(unixToApple(0)).toBe(-APPLE_EPOCH_OFFSET);
  });

  it('is the inverse of appleToUnix', () => {
    const appleTs = 725760000;
    expect(unixToApple(appleToUnix(appleTs))).toBe(appleTs);
  });

  it('converts a known Unix timestamp', () => {
    // 2024-01-01 00:00:00 UTC
    expect(unixToApple(1704067200)).toBe(725760000);
  });
});
