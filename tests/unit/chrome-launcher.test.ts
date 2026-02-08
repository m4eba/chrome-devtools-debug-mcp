import { describe, it, expect } from 'vitest';
import { findChrome } from '../../src/chrome-launcher.js';

describe('chrome-launcher', () => {
  describe('findChrome', () => {
    it('should find Chrome or return null', () => {
      const chrome = findChrome();
      // We don't know if Chrome is installed, but the function should work
      expect(chrome === null || typeof chrome === 'string').toBe(true);
    });
  });

  // Note: launchChrome tests require Chrome to be installed
  // and would be integration tests rather than unit tests
});
