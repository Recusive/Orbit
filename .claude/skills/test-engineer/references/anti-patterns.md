# Anti-Patterns: Tests to Never Write

## 1. Always-Passing Assertions

These tests pass regardless of implementation correctness.

```typescript
// BAD: toBeDefined passes for any non-undefined value
it('should initialize store', () => {
  const store = useStore.getState();
  expect(store).toBeDefined();
});

// BAD: toBeInstanceOf doesn't verify behavior
it('should create node', () => {
  const node = createNode('agent');
  expect(node).toBeInstanceOf(Object);
});

// BAD: Checking type instead of value
it('should return items', () => {
  const items = getItems();
  expect(Array.isArray(items)).toBe(true);
});

// GOOD: Verify actual expected values
it('should initialize store with empty items', () => {
  const store = useStore.getState();
  expect(store.items).toEqual([]);
  expect(store.isLoading).toBe(false);
});

// GOOD: Verify node properties
it('should create node with correct type and id', () => {
  const node = createNode('agent');
  expect(node.type).toBe('agent');
  expect(node.id).toMatch(/^node-/);
});
```

## 2. Placeholder Tests

Empty or incomplete tests that provide false confidence.

```typescript
// BAD: TODO comment
it('should handle edge cases', () => {
  // TODO: implement later
});

// BAD: Empty test body
it('should validate input', () => {});

// BAD: Trivial always-true assertion
it('should work', () => {
  expect(true).toBe(true);
});

// BAD: Console.log instead of assertion
it('should process data', () => {
  const result = processData(input);
  console.log(result); // "Looks good to me!"
});

// GOOD: If you can't test it now, don't write the test
// Delete the test entirely and add it when you can write real assertions
```

## 3. Testing Implementation Details

Tests that break when refactoring without behavior change.

```typescript
// BAD: Testing internal state shape
it('should update internal cache', () => {
  store.fetchItems();
  expect(store.getState()._cache.lastFetch).toBeDefined();
});

// BAD: Testing private method
it('should call _normalizeInput', () => {
  const spy = vi.spyOn(service, '_normalizeInput');
  service.process('input');
  expect(spy).toHaveBeenCalled();
});

// BAD: Testing specific implementation
it('should use Array.reduce internally', () => {
  const spy = vi.spyOn(Array.prototype, 'reduce');
  sum([1, 2, 3]);
  expect(spy).toHaveBeenCalled();
});

// GOOD: Test observable behavior only
it('should return sum of array', () => {
  expect(sum([1, 2, 3])).toBe(6);
});

// GOOD: Test public API
it('should return normalized items', () => {
  store.fetchItems();
  const items = store.getState().items;
  expect(items[0].name).toBe('expected-name');
});
```

## 4. Tests Without Isolation

Tests that depend on other tests or shared state.

```typescript
// BAD: Tests share mutable state
let sharedStore: Store;

describe('store', () => {
  beforeAll(() => {
    sharedStore = createStore();
  });

  it('should add item', () => {
    sharedStore.addItem({ id: '1' });
    expect(sharedStore.items).toHaveLength(1);
  });

  it('should have two items after adding another', () => {
    // FAILS if previous test didn't run!
    sharedStore.addItem({ id: '2' });
    expect(sharedStore.items).toHaveLength(2);
  });
});

// GOOD: Reset state in beforeEach
describe('store', () => {
  beforeEach(() => {
    useStore.getState().reset?.();
    // OR: useStore.setState(initialState, true)
  });

  it('should add item', () => {
    useStore.getState().addItem({ id: '1' });
    expect(useStore.getState().items).toHaveLength(1);
  });

  it('should add item independently', () => {
    useStore.getState().addItem({ id: '2' });
    expect(useStore.getState().items).toHaveLength(1); // Still 1, not 2
  });
});
```

## 5. Over-Mocking

Mocking so much that you're not testing real behavior.

```typescript
// BAD: Mocking the thing you're testing
it('should format date', () => {
  vi.spyOn(formatter, 'formatDate').mockReturnValue('2024-01-01');
  expect(formatter.formatDate(new Date())).toBe('2024-01-01');
  // This test literally tests nothing!
});

// BAD: Mocking everything
it('should process order', async () => {
  vi.mock('./validate', () => ({ validate: vi.fn(() => true) }));
  vi.mock('./calculate', () => ({ calculate: vi.fn(() => 100) }));
  vi.mock('./save', () => ({ save: vi.fn(() => Promise.resolve()) }));

  const result = await processOrder(order);
  expect(result).toBe(true);
  // You're testing that true === true
});

// GOOD: Mock only external boundaries
it('should process order', async () => {
  vi.mocked(invoke).mockResolvedValue({ orderId: '123' }); // Only mock Tauri

  const result = await processOrder({ items: [{ price: 50 }] });

  expect(result.total).toBe(50);
  expect(invoke).toHaveBeenCalledWith(
    'save_order',
    expect.objectContaining({
      total: 50,
    })
  );
});
```

## 6. Snapshot Abuse

Using snapshots when explicit assertions are clearer.

```typescript
// BAD: Snapshot for simple values
it('should return user', () => {
  const user = getUser('1')
  expect(user).toMatchSnapshot()
})

// BAD: Large component snapshot
it('should render dashboard', () => {
  const { container } = render(<Dashboard />)
  expect(container).toMatchSnapshot() // 500+ lines of HTML
})

// GOOD: Explicit assertions
it('should return user with correct properties', () => {
  const user = getUser('1')
  expect(user.id).toBe('1')
  expect(user.name).toBe('John')
  expect(user.email).toContain('@')
})

// GOOD: Targeted assertions on rendered output
it('should render user name and avatar', () => {
  render(<Dashboard user={mockUser} />)
  expect(screen.getByText('John')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Avatar' })).toHaveAttribute('src', mockUser.avatar)
})
```

## 7. Testing Framework Features

Testing that the test framework works, not your code.

```typescript
// BAD: Testing that mocks work
it('should mock invoke', () => {
  vi.mocked(invoke).mockResolvedValue('test')
  expect(invoke).toBeDefined()
})

// BAD: Testing React renders at all
it('should render without crashing', () => {
  render(<Component />)
  // No assertions!
})

// GOOD: Test your code's behavior
it('should display file content after loading', async () => {
  vi.mocked(invoke).mockResolvedValue({ content: 'Hello' })

  render(<FileViewer path="/test.txt" />)

  await waitFor(() => {
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

## 8. Flaky Async Tests

Tests that sometimes pass, sometimes fail due to timing issues.

```typescript
// BAD: Using arbitrary delays
it('should show result after loading', async () => {
  render(<AsyncComponent />)
  await new Promise(resolve => setTimeout(resolve, 100)) // Magic number!
  expect(screen.getByText('Result')).toBeInTheDocument()
})

// BAD: Not waiting for async operations
it('should update after click', () => {
  render(<Component />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByText('Updated')).toBeInTheDocument() // May not exist yet!
})

// GOOD: Use proper async utilities
it('should show result after loading', async () => {
  render(<AsyncComponent />)
  await waitFor(() => {
    expect(screen.getByText('Result')).toBeInTheDocument()
  })
})

// GOOD: Use findBy for async elements
it('should show result after loading', async () => {
  render(<AsyncComponent />)
  expect(await screen.findByText('Result')).toBeInTheDocument()
})

// GOOD: Use userEvent (which handles async internally)
it('should update after click', async () => {
  const user = userEvent.setup()
  render(<Component />)
  await user.click(screen.getByRole('button'))
  expect(screen.getByText('Updated')).toBeInTheDocument()
})
```

## 9. Testing the Same Thing Multiple Ways

Redundant tests that all verify the same behavior.

```typescript
// BAD: Three tests that all check "state updates"
it('should update items array', () => {
  store.addItem({ id: '1' });
  expect(store.getState().items.length).toBe(1);
});

it('should add item to items', () => {
  store.addItem({ id: '1' });
  expect(store.getState().items).toContainEqual({ id: '1' });
});

it('should have item after adding', () => {
  store.addItem({ id: '1' });
  expect(store.getState().items[0].id).toBe('1');
});

// GOOD: One comprehensive test
it('should add item to items array', () => {
  store.addItem({ id: '1', name: 'Test' });

  const items = store.getState().items;
  expect(items).toHaveLength(1);
  expect(items[0]).toEqual({ id: '1', name: 'Test' });
});
```

## 10. Testing Call Order

Asserting on implementation order, not outcomes.

```typescript
// BAD: Testing that functions were called in specific order
it('should validate then save', () => {
  const validateSpy = vi.spyOn(service, 'validate');
  const saveSpy = vi.spyOn(service, 'save');

  service.process(data);

  expect(validateSpy.mock.invocationCallOrder[0]).toBeLessThan(saveSpy.mock.invocationCallOrder[0]);
});

// GOOD: Test the outcome, not the order
it('should not save invalid data', async () => {
  vi.mocked(invoke).mockResolvedValue({ success: true });

  await service.process({ invalid: true });

  expect(invoke).not.toHaveBeenCalledWith('save', expect.anything());
});

it('should save valid data', async () => {
  vi.mocked(invoke).mockResolvedValue({ success: true });

  await service.process({ valid: true });

  expect(invoke).toHaveBeenCalledWith('save', expect.objectContaining({ valid: true }));
});
```

## 11. Excessive Happy Path, Sparse Error Testing

10 success tests, 1 error test.

```typescript
// BAD: All happy paths
describe('userService', () => {
  it('should create user', async () => {
    /* ... */
  });
  it('should update user', async () => {
    /* ... */
  });
  it('should delete user', async () => {
    /* ... */
  });
  it('should get user by id', async () => {
    /* ... */
  });
  it('should list all users', async () => {
    /* ... */
  });
  // No error tests!
});

// GOOD: Balance success and failure cases
describe('userService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      /* ... */
    });
    it('should reject invalid email', async () => {
      /* ... */
    });
    it('should reject duplicate username', async () => {
      /* ... */
    });
    it('should handle network failure', async () => {
      /* ... */
    });
  });
});
```

---

## Quick Checklist

Before committing any test, verify:

1. **Delete the implementation** - Does the test fail?
2. **Return wrong value** - Does the test catch it?
3. **Run test alone** - Does it pass without other tests?
4. **Read the assertions** - Do they verify actual behavior?
5. **Check for magic delays** - Are you using `waitFor` instead of `setTimeout`?
6. **Count error tests** - Do you have at least one error case per function?

If any answer is "no", rewrite the test.
