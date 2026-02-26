import { isPathEqualOrWithin, isPathWithin, toRelativePath } from '@/lib/utils/path-utils';

describe('path-utils root containment', () => {
  it('handles POSIX root parents', () => {
    expect(isPathEqualOrWithin('/', '/')).toBe(true);
    expect(isPathWithin('/', '/')).toBe(false);
    expect(isPathWithin('/Users/demo/project', '/')).toBe(true);
    expect(toRelativePath('/Users/demo/project', '/')).toBe('Users/demo/project');
  });

  it('handles Windows drive root parents', () => {
    expect(isPathEqualOrWithin('C:/', 'C:/')).toBe(true);
    expect(isPathWithin('C:/', 'C:/')).toBe(false);
    expect(isPathWithin('C:/Users/demo/project', 'C:/')).toBe(true);
    expect(toRelativePath('C:/Users/demo/project', 'C:/')).toBe('users/demo/project');
  });

  it('keeps non-descendants outside the root scope', () => {
    expect(isPathWithin('/foo', '/bar')).toBe(false);
    expect(toRelativePath('/foo', '/bar')).toBeNull();
  });
});
