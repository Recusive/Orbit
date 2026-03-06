import { getImageMimeType, isImageFile, isSvgFile } from '@/lib/utils';

describe('image-utils', () => {
  describe('isImageFile', () => {
    it('returns true for supported image extensions', () => {
      expect(isImageFile('/assets/photo.png')).toBe(true);
      expect(isImageFile('/assets/photo.JPG')).toBe(true);
      expect(isImageFile('/assets/animation.gif')).toBe(true);
      expect(isImageFile('/assets/vector.svg')).toBe(true);
      expect(isImageFile('/assets/icon.avif')).toBe(true);
    });

    it('returns false for non-image files', () => {
      expect(isImageFile('/src/app.ts')).toBe(false);
      expect(isImageFile('/docs/readme.md')).toBe(false);
      expect(isImageFile('/notes/todo.txt')).toBe(false);
    });
  });

  describe('isSvgFile', () => {
    it('returns true only for svg files', () => {
      expect(isSvgFile('/assets/vector.svg')).toBe(true);
      expect(isSvgFile('/assets/vector.SVG')).toBe(true);
      expect(isSvgFile('/assets/vector.png')).toBe(false);
    });
  });

  describe('getImageMimeType', () => {
    it('returns the expected mime type for known image extensions', () => {
      expect(getImageMimeType('/assets/photo.png')).toBe('image/png');
      expect(getImageMimeType('/assets/photo.jpg')).toBe('image/jpeg');
      expect(getImageMimeType('/assets/vector.svg')).toBe('image/svg+xml');
      expect(getImageMimeType('/assets/icon.ico')).toBe('image/x-icon');
      expect(getImageMimeType('/assets/render.webp')).toBe('image/webp');
    });

    it('falls back to octet-stream for unknown extensions', () => {
      expect(getImageMimeType('/assets/file.unknown')).toBe('application/octet-stream');
    });
  });
});
