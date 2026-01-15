---
name: web-design-guidelines
description: Web Interface Guidelines for accessibility, UX, and performance. Apply when reviewing UI code, checking accessibility, auditing components, or building new interfaces.
triggers:
  - reviewing UI components
  - checking accessibility
  - auditing design
  - building forms
  - implementing animations
---

# Web Design Guidelines for Orbit

Comprehensive UI audit checklist covering accessibility, performance, and UX. Contains 100+ rules across 15 categories, adapted from Vercel's Web Interface Guidelines.

## Quick Audit Checklist

When reviewing UI code, check against these categories:

| Category      | Key Checks                                       |
| ------------- | ------------------------------------------------ |
| Accessibility | aria-labels, semantic HTML, keyboard support     |
| Focus States  | visible focus rings, focus-visible usage         |
| Forms         | labels, autocomplete, validation, error handling |
| Animation     | reduced-motion, transform/opacity only           |
| Typography    | proper quotes, ellipsis, tabular-nums            |
| Images        | dimensions, loading strategy, alt text           |
| Performance   | virtualization, batch DOM ops                    |
| Dark Mode     | color-scheme, theme-color meta                   |

---

## 1. Accessibility

### Icon Buttons Need aria-label

```tsx
// BAD: No accessible name
<button onClick={onClose}>
  <X className="h-4 w-4" />
</button>

// GOOD: Screen reader can announce purpose
<button onClick={onClose} aria-label="Close dialog">
  <X className="h-4 w-4" />
</button>
```

### Form Controls Need Labels

```tsx
// BAD: No label association
<input type="text" placeholder="Search..." />

// GOOD: Proper label (can be visually hidden)
<label htmlFor="search" className="sr-only">Search</label>
<input id="search" type="text" placeholder="Search..." />

// ALSO GOOD: aria-label for compact UI
<input type="text" placeholder="Search..." aria-label="Search files" />
```

### Interactive Elements Need Keyboard Support

```tsx
// BAD: Only mouse support
<div onClick={handleClick}>Click me</div>

// GOOD: Full keyboard support
<button onClick={handleClick}>Click me</button>

// If div is necessary, add keyboard handlers
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
>
  Click me
</div>
```

### Use Semantic HTML

```tsx
// BAD: Div soup
<div className="nav">
  <div className="nav-item" onClick={goHome}>Home</div>
</div>

// GOOD: Semantic elements
<nav>
  <a href="/" onClick={goHome}>Home</a>
</nav>
```

### Decorative Icons Need aria-hidden

```tsx
// GOOD: Icon is decorative (text provides meaning)
<button>
  <Plus className="h-4 w-4" aria-hidden="true" />
  Add File
</button>

// GOOD: Icon IS the label, needs aria-label on button
<button aria-label="Add file">
  <Plus className="h-4 w-4" />
</button>
```

### Async Updates Need aria-live

```tsx
// GOOD: Screen readers announce status changes
<div aria-live="polite" aria-atomic="true">
  {isLoading ? 'Loading...' : `${count} results found`}
</div>
```

---

## 2. Focus States

### Visible Focus Required

```tsx
// BAD: Removes focus indicator
<button className="outline-none">Submit</button>

// GOOD: Custom focus ring
<button className="focus-visible:ring-2 focus-visible:ring-primary">
  Submit
</button>
```

### Use focus-visible Over focus

```css
/* BAD: Shows ring on click too */
button:focus {
  outline: 2px solid var(--primary);
}

/* GOOD: Only shows ring for keyboard navigation */
button:focus-visible {
  outline: 2px solid var(--primary);
}

/* Tailwind */
.btn {
  @apply focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2;
}
```

### Group Focus with focus-within

```tsx
// GOOD: Parent highlights when child is focused
<div className="border focus-within:border-primary focus-within:ring-1">
  <input type="text" className="border-0 outline-none" />
  <button>Search</button>
</div>
```

---

## 3. Forms

### Inputs Need autocomplete and name

```tsx
// BAD: Browser can't help user
<input type="text" />

// GOOD: Browser can autofill
<input
  type="email"
  name="email"
  autoComplete="email"
  inputMode="email"
/>
```

### Use Correct Input Types

| Data     | type     | inputMode |
| -------- | -------- | --------- |
| Email    | email    | email     |
| Phone    | tel      | tel       |
| URL      | url      | url       |
| Number   | text     | numeric   |
| Search   | search   | search    |
| Password | password | -         |

### Never Block Paste

```tsx
// BAD: Prevents password managers
<input type="password" onPaste={(e) => e.preventDefault()} />

// GOOD: Allow paste
<input type="password" />
```

### Disable Spellcheck on Codes/Emails

```tsx
// GOOD: No red squiggles on technical input
<input type="text" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
```

### Error Messages Inline with Focus

```tsx
// GOOD: Error appears near input, input gets focus
<div>
  <input
    ref={inputRef}
    aria-invalid={!!error}
    aria-describedby={error ? 'email-error' : undefined}
  />
  {error && (
    <p id="email-error" className="text-destructive text-sm">
      {error}
    </p>
  )}
</div>;

// On submit, focus first error
if (errors.length > 0) {
  firstErrorRef.current?.focus();
}
```

### Submit Button State

```tsx
// GOOD: Enabled until request starts, shows progress
<button type="submit" disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <Spinner className="animate-spin mr-2" />
      Saving...
    </>
  ) : (
    'Save'
  )}
</button>
```

---

## 4. Animation

### Honor prefers-reduced-motion

```css
/* GOOD: Respects user preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Or in Tailwind */
.animate-fade-in {
  @apply motion-safe:animate-fade-in motion-reduce:animate-none;
}
```

### Only Animate transform and opacity

```css
/* BAD: Animates layout properties (triggers reflow) */
.panel {
  transition:
    width 200ms,
    height 200ms;
}

/* GOOD: GPU-accelerated properties only */
.panel {
  transition:
    transform 200ms,
    opacity 200ms;
}
```

### Never Use transition: all

```css
/* BAD: Transitions everything, performance hit */
.button {
  transition: all 200ms;
}

/* GOOD: Explicit properties */
.button {
  transition:
    background-color 200ms,
    color 200ms;
}
```

### Animations Must Be Interruptible

```tsx
// GOOD: User can interrupt animation
const [isOpen, setIsOpen] = useState(false)

// Animation automatically reverses if state changes mid-animation
<div
  className={cn(
    'transition-transform duration-200',
    isOpen ? 'translate-x-0' : '-translate-x-full'
  )}
/>
```

---

## 5. Typography

### Use Proper Characters

| Instead of       | Use     | Name                |
| ---------------- | ------- | ------------------- |
| `...`            | `...`   | Ellipsis            |
| `"` `"`          | `"` `"` | Curly quotes        |
| `'`              | `'`     | Apostrophe          |
| `-` (for ranges) | `--`    | En dash             |
| `x` (dimensions) | `x`     | Multiplication sign |

### Loading States End with Ellipsis

```tsx
// GOOD: Indicates ongoing action
{
  isLoading && <span>Loading...</span>;
}
{
  isSaving && <span>Saving...</span>;
}
```

### Use tabular-nums for Number Columns

```tsx
// GOOD: Numbers align in columns
<td className="font-variant-numeric: tabular-nums">
  {formatNumber(value)}
</td>

// Tailwind
<td className="tabular-nums">{value}</td>
```

### Use text-wrap: balance for Headings

```css
h1,
h2,
h3 {
  text-wrap: balance;
}

/* Or pretty for body text */
p {
  text-wrap: pretty;
}
```

---

## 6. Content Handling

### Handle Long Content

```tsx
// GOOD: Truncate with ellipsis
<span className="truncate">{fileName}</span>

// GOOD: Multi-line clamp
<p className="line-clamp-3">{description}</p>

// GOOD: Break long words
<code className="break-all">{longHash}</code>
```

### Flex Children Need min-w-0

```tsx
// BAD: Text overflows flex container
<div className="flex">
  <span className="truncate">{longText}</span>
</div>

// GOOD: min-w-0 allows truncation to work
<div className="flex">
  <span className="truncate min-w-0">{longText}</span>
</div>
```

### Handle Empty States

```tsx
// GOOD: Always handle empty case
{
  items.length > 0 ? <ItemList items={items} /> : <EmptyState message="No files found" />;
}
```

---

## 7. Images

### Images Need Explicit Dimensions

```tsx
// BAD: Causes layout shift
<img src={url} alt="Preview" />

// GOOD: Reserves space during load
<img src={url} alt="Preview" width={400} height={300} />
```

### Lazy Load Below-Fold Images

```tsx
// GOOD: Defers loading until near viewport
<img src={url} loading="lazy" alt="..." width={400} height={300} />
```

### Critical Images Need Priority

```tsx
// GOOD: Above-fold hero image loads immediately
<img src={heroUrl} fetchPriority="high" alt="..." width={1200} height={600} />
```

---

## 8. Performance

### Virtualize Long Lists

```tsx
// BAD: Renders all 1000 items
{
  items.map((item) => <Item key={item.id} {...item} />);
}

// GOOD: Only renders visible items
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 40,
});
```

### Batch DOM Operations

```typescript
// BAD: Multiple reflows
element.style.width = '100px';
const height = element.offsetHeight; // Forces reflow
element.style.height = '200px';

// GOOD: Batch reads, then writes
const height = element.offsetHeight; // Read
element.style.width = '100px'; // Write
element.style.height = '200px'; // Write
```

### Preconnect to External Origins

```html
<!-- GOOD: Establish connection early -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://api.example.com" />
```

---

## 9. Dark Mode (Tauri/Desktop)

### Set color-scheme on html

```css
html.dark {
  color-scheme: dark;
}

html:not(.dark) {
  color-scheme: light;
}
```

### Native Controls Need Explicit Colors

```css
/* Native selects inherit dark mode incorrectly */
select {
  background-color: var(--background);
  color: var(--foreground);
}
```

---

## 10. Anti-Patterns to Flag

Always flag these issues in code review:

| Pattern                             | Problem                            |
| ----------------------------------- | ---------------------------------- |
| `outline-none` without replacement  | Breaks keyboard navigation         |
| `transition: all`                   | Performance, unintended animations |
| `<div onClick>` for navigation      | No right-click, no keyboard        |
| Images without dimensions           | Layout shift                       |
| `onPaste` with preventDefault       | Blocks password managers           |
| Hardcoded date/number formats       | i18n issues                        |
| Large arrays without virtualization | Performance                        |
| `autoFocus` without justification   | Accessibility                      |

---

## Orbit-Specific Guidelines

### Tauri WebView Considerations

Due to WKWebView rendering differences, avoid:

- `backdrop-filter: blur()` on interactive elements
- `color-mix()` CSS function
- Transitions on elements inside ReactFlow's viewport

See CLAUDE.md "Tauri WebView Blur/Rendering Issues" for details.

### Panel Resize Handles

```tsx
// GOOD: Accessible resize handle
<div
  role="separator"
  aria-orientation="vertical"
  aria-valuenow={panelWidth}
  tabIndex={0}
  onKeyDown={handleKeyResize}
  className="cursor-col-resize focus-visible:bg-primary"
/>
```

### Terminal Accessibility

```tsx
// GOOD: Terminal output is announced
<div role="log" aria-live="polite" aria-label="Terminal output">
  {terminalContent}
</div>
```

---

## References

- Source: [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- WCAG 2.1: https://www.w3.org/WAI/WCAG21/quickref/
- MDN Accessibility: https://developer.mozilla.org/en-US/docs/Web/Accessibility
