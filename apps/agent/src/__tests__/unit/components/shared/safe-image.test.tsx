import { render, screen, waitFor } from '@testing-library/react';

import { SafeImage, dataUrlToBlob } from '@/components/shared/SafeImage';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_JPEG_DATA_URL = 'data:image/jpeg;base64,AQID';
const PERCENT_ENCODED_DATA_URL =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%2F%3E';
const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL');
const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');

describe('dataUrlToBlob', () => {
  it('returns a blob for a valid base64 PNG data URL', () => {
    const blob = dataUrlToBlob(VALID_PNG_DATA_URL);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/png');
  });

  it('returns a blob for a valid base64 JPEG data URL', () => {
    const blob = dataUrlToBlob(VALID_JPEG_DATA_URL);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/jpeg');
  });

  it('returns null for a data URL without a comma separator', () => {
    expect(dataUrlToBlob('data:image/png;base64')).toBeNull();
  });

  it('returns null for a percent-encoded data URL', () => {
    expect(dataUrlToBlob(PERCENT_ENCODED_DATA_URL)).toBeNull();
  });

  it('returns null for an invalid base64 payload', () => {
    expect(dataUrlToBlob('data:image/png;base64,!!!invalid')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(dataUrlToBlob('')).toBeNull();
  });
});

describe('SafeImage', () => {
  beforeEach(() => {
    let blobUrlCounter = 0;

    createObjectURLSpy.mockReset();
    revokeObjectURLSpy.mockReset();

    createObjectURLSpy.mockImplementation(() => {
      blobUrlCounter += 1;
      return `blob:mock-url-${String(blobUrlCounter)}`;
    });
    revokeObjectURLSpy.mockImplementation(() => undefined);
  });

  afterAll(() => {
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('passes through non-data URLs unchanged', () => {
    render(<SafeImage src="asset://foo.png" alt="Asset image" />);

    expect(screen.getByRole('img', { name: 'Asset image' })).toHaveAttribute(
      'src',
      'asset://foo.png'
    );
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('passes through percent-encoded data URLs unchanged', () => {
    render(<SafeImage src={PERCENT_ENCODED_DATA_URL} alt="Inline image" />);

    expect(screen.getByRole('img', { name: 'Inline image' })).toHaveAttribute(
      'src',
      PERCENT_ENCODED_DATA_URL
    );
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('converts base64 data URLs to blob URLs', async () => {
    render(<SafeImage src={VALID_PNG_DATA_URL} alt="Preview image" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
        'src',
        'blob:mock-url-1'
      );
    });

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the blob URL on unmount', async () => {
    const { unmount } = render(<SafeImage src={VALID_PNG_DATA_URL} alt="Preview image" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
        'src',
        'blob:mock-url-1'
      );
    });

    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url-1');
  });

  it('revokes the previous blob URL when the src changes between data URLs', async () => {
    const { rerender } = render(<SafeImage src={VALID_PNG_DATA_URL} alt="Preview image" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
        'src',
        'blob:mock-url-1'
      );
    });

    rerender(<SafeImage src={VALID_JPEG_DATA_URL} alt="Preview image" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
        'src',
        'blob:mock-url-2'
      );
    });

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url-1');
  });

  it('updates from a blob URL to an asset URL when the preview is patched', async () => {
    const { rerender } = render(<SafeImage src={VALID_PNG_DATA_URL} alt="Preview image" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
        'src',
        'blob:mock-url-1'
      );
    });

    rerender(<SafeImage src="asset://localhost/cached-image.png" alt="Preview image" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
        'src',
        'asset://localhost/cached-image.png'
      );
    });

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url-1');
  });

  it('fires onError and omits the img element for malformed data URLs', async () => {
    const onError = vi.fn();

    render(<SafeImage src="data:bad" alt="Broken preview" onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole('img', { name: 'Broken preview' })).not.toBeInTheDocument();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('does not call onError for valid data URLs', async () => {
    const onError = vi.fn();

    render(<SafeImage src={VALID_PNG_DATA_URL} alt="Preview image" onError={onError} />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
        'src',
        'blob:mock-url-1'
      );
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('forwards standard img props', () => {
    render(
      <SafeImage
        src="asset://foo.png"
        alt="Forwarded props"
        className="rounded-xl object-cover"
        loading="lazy"
      />
    );

    const image = screen.getByRole('img', { name: 'Forwarded props' });
    expect(image).toHaveAttribute('src', 'asset://foo.png');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveClass('rounded-xl', 'object-cover');
  });
});
