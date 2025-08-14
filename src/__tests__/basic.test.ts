/**
 * Basic test to verify Jest setup
 */

describe('Jest Setup', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have proper TypeScript support', () => {
    const obj: { name: string; value: number } = {
      name: 'test',
      value: 42
    };
    
    expect(obj.name).toBe('test');
    expect(obj.value).toBe(42);
  });
});