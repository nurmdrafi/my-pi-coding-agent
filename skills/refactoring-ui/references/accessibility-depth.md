# Accessibility Deep Dive

WCAG 2.1 AA compliance checklist + implementation guidance.

## Philosophy

Accessibility = UX for everyone: keyboard nav helps power users, good contrast helps in sunlight, clear focus states help everyone, proper headings help screen readers AND SEO.

## WCAG 2.1 AA Checklist

### Perceivable

#### 1.1 Text alternatives

All images need alt text:

```html
<!-- Decorative (no alt) -->
<img src="divider.svg" alt="" role="presentation">

<!-- Informative -->
<img src="chart.png" alt="Sales increased 40% from Q1 to Q2">

<!-- Functional (button/link) -->
<button>
  <img src="search.svg" alt="Search">
</button>

<!-- Complex (needs long description) -->
<figure>
  <img src="diagram.png" alt="System architecture overview" aria-describedby="diagram-desc">
  <figcaption id="diagram-desc">Detailed description of the system architecture...</figcaption>
</figure>
```

Icons:
```html
<!-- Icon + visible text (icon decorative) -->
<button>
  <svg aria-hidden="true">...</svg>
  <span>Settings</span>
</button>

<!-- Icon-only button -->
<button aria-label="Settings">
  <svg aria-hidden="true">...</svg>
</button>
```

#### 1.3 Adaptable

Semantic HTML:
```html
<header>...</header>
<nav>...</nav>
<main>
  <article>
    <h1>Page Title</h1>
    <section>
      <h2>Section Title</h2>
    </section>
  </article>
</main>
<footer>...</footer>

<!-- NOT div class="header" / div class="nav" -->
```

Heading hierarchy: one `<h1>` per page, no skipped levels (h1 → h3), headings describe content structure.

Form labels:
```html
<!-- Explicit -->
<label for="email">Email</label>
<input id="email" type="email">

<!-- Implicit -->
<label>
  Email
  <input type="email">
</label>

<!-- Hidden (visual design without labels) -->
<label for="search" class="sr-only">Search</label>
<input id="search" type="search" placeholder="Search...">
```

#### 1.4 Distinguishable

Contrast:

| Content Type | Minimum Ratio | Tool |
|--------------|---------------|------|
| Normal text (<18px) | 4.5:1 | WebAIM Contrast Checker |
| Large text (≥18px or ≥14px bold) | 3:1 | |
| UI components & graphics | 3:1 | |

```css
/* Too light - fails */
.text-light { color: #9ca3af; } /* gray-400: 3.1:1 on white */

/* Passes AA */
.text-muted { color: #6b7280; } /* gray-500: 4.6:1 on white */

/* Passes AAA */
.text-strong { color: #374151; } /* gray-700: 9.1:1 on white */
```

Never color alone:
```html
<!-- Bad: only color indicates error -->
<input class="border-red-500">

<!-- Good: color + icon + text -->
<input class="border-red-500" aria-invalid="true" aria-describedby="error">
<p id="error" class="text-red-600">
  <svg aria-hidden="true">WARNING:</svg>
  Email is required
</p>
```

Text resize: readable at 200% zoom; relative units (rem, em) not px for text; test by zooming to 200%.

### Operable

#### 2.1 Keyboard accessible

| Key | Expected Behavior |
|-----|-------------------|
| Tab | Next focusable element |
| Shift+Tab | Previous focusable element |
| Enter | Activate links, buttons |
| Space | Activate buttons, toggle checkboxes |
| Arrows | Navigate within components (tabs, menus, radios) |
| Escape | Close modals, dropdowns, cancel actions |

Visible focus:

```css
/* Never remove outlines without replacement */
:focus {
  outline: none; /* ✗ Never do this without replacement */
}

/* Provide visible focus */
:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Or ring utility */
.focusable:focus-visible {
  @apply ring-2 ring-blue-500 ring-offset-2;
}
```

Keyboard traps: modals trap focus inside but must have exit (Escape, close button):

```jsx
// Focus trap for modals
function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef();

  useEffect(() => {
    if (isOpen) {
      // Focus first focusable element
      const firstFocusable = modalRef.current.querySelector('button, input, a');
      firstFocusable?.focus();

      // Trap focus inside
      const handleTab = (e) => {
        if (e.key === 'Tab') {
          // ... trap logic
        }
        if (e.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleTab);
      return () => document.removeEventListener('keydown', handleTab);
    }
  }, [isOpen]);

  // Return focus on close
}
```

Skip links:

```html
<body>
  <a href="#main-content" class="sr-only focus:not-sr-only">
    Skip to main content
  </a>
  <nav>...</nav>
  <main id="main-content">...</main>
</body>
```

#### 2.4 Navigable

- Page titles: unique, descriptive, format `Page Name | Site Name`
- Focus order: logical reading order; no positive `tabindex` (messes order); only `tabindex="0"` (focusable) or `tabindex="-1"` (programmatically focusable)

Link purpose:
```html
<!-- Bad -->
<a href="/article">Click here</a>
<a href="/article">Read more</a>

<!-- Good -->
<a href="/article">Read more about accessibility best practices</a>

<!-- Or with context -->
<a href="/article" aria-describedby="article-title">Read more</a>
```

### Understandable

#### 3.1 Readable

```html
<html lang="en">
  <body>
    <p>This is English.</p>
    <p lang="fr">Ceci est français.</p>
  </body>
</html>
```

#### 3.2 Predictable

- Same navigation in same location across pages; same elements behave same way
- No unexpected changes: no auto-submit on input change, no unexpected pop-ups, focus doesn't move unexpectedly

```html
<!-- Bad: changes page on select -->
<select onchange="window.location = this.value">...</select>

<!-- Good: explicit action -->
<select id="region">...</select>
<button onclick="navigate()">Go</button>
```

#### 3.3 Input assistance

Error identification:
```html
<label for="email">Email</label>
<input
  id="email"
  type="email"
  aria-invalid="true"
  aria-describedby="email-error"
>
<p id="email-error" class="error">
  Please enter a valid email address (e.g., name@example.com)
</p>
```

Required fields:
```html
<label for="name">
  Name <span aria-hidden="true">*</span>
  <span class="sr-only">(required)</span>
</label>
<input id="name" required aria-required="true">
```

Error prevention for critical actions: confirm destructive, allow review before submission, provide undo.

### Robust

#### 4.1 Compatible

Valid HTML: unique IDs, complete tags, proper nesting.

ARIA — use correctly:
```html
<!-- Roles -->
<div role="button" tabindex="0" onclick="...">Fake Button</div>
<!-- Better: just use <button> -->

<!-- States -->
<button aria-pressed="true">Bold</button>
<button aria-expanded="false" aria-controls="menu">Menu</button>

<!-- Live regions -->
<div aria-live="polite" aria-atomic="true">
  <!-- Screen reader announces changes here -->
</div>
```

## Focus Management

| Scenario | Focus Action |
|----------|--------------|
| Modal opens | Focus first element inside modal |
| Modal closes | Return focus to trigger element |
| Error occurs | Focus error message or first invalid field |
| New content loads | Focus heading or first new element |
| Item deleted | Focus previous/next item or container |

```jsx
// Store trigger reference
const triggerRef = useRef();

function openModal() {
  triggerRef.current = document.activeElement;
  setIsOpen(true);
}

function closeModal() {
  setIsOpen(false);
  // Return focus after state update
  setTimeout(() => triggerRef.current?.focus(), 0);
}
```

### Roving tabindex (component groups)

```jsx
// Tab panels, menu items, radio groups
function Tabs({ tabs }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      setActiveIndex((activeIndex + 1) % tabs.length);
    }
    if (e.key === 'ArrowLeft') {
      setActiveIndex((activeIndex - 1 + tabs.length) % tabs.length);
    }
  };

  return (
    <div role="tablist" onKeyDown={handleKeyDown}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          role="tab"
          tabIndex={i === activeIndex ? 0 : -1}
          aria-selected={i === activeIndex}
          ref={i === activeIndex ? (el) => el?.focus() : null}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

## Screen Reader Considerations

Announce dynamic changes:
```html
<div aria-live="polite" class="sr-only" id="status"></div>

<script>
function showSuccess(message) {
  document.getElementById('status').textContent = message;
}
</script>
```

Hide decorative content:
```html
<svg aria-hidden="true">...</svg>
<span aria-hidden="true">•</span>
```

Provide context:
```html
<!-- Ambiguous -->
<button>Delete</button>

<!-- Clear -->
<button aria-label="Delete comment by John">Delete</button>

<!-- Or aria-describedby -->
<button aria-describedby="comment-123-author">Delete</button>
<span id="comment-123-author" class="sr-only">comment by John</span>
```

## Testing Tools

| Tool | Catches |
|------|---------|
| axe DevTools | ~30% of WCAG issues |
| WAVE | Similar to axe, visual overlay |
| Lighthouse | Basic accessibility audit |
| ESLint a11y plugin | Issues in JSX |

Manual testing required — automated tools miss ~70%. Check: keyboard navigation flow, screen reader experience, focus management, meaningful alt text, logical heading structure.

### Checklist

- [ ] Navigate entire page keyboard-only
- [ ] Screen reader test (VoiceOver, NVDA)
- [ ] Color contrast tool check
- [ ] Zoom to 200%, verify usability
- [ ] High contrast mode test
- [ ] Focus indicators visible
- [ ] Heading structure via outline tool
- [ ] axe DevTools audit
- [ ] Forms with validation errors

## Common Fixes Quick Reference

| Issue | Fix |
|-------|-----|
| Missing alt text | Descriptive alt or `alt=""` for decorative |
| Low contrast | gray-600+ for text on white |
| Missing focus style | `focus-visible` ring/outline |
| Click-only interaction | Keyboard handler + focusability |
| Missing form labels | `<label>` with `for` attribute |
| Heading skip | h1→h2→h3 in order |
| Color-only indicator | Icon/text alongside color |
| Modal focus trap | Trap focus, Escape closes |
| Auto-playing media | Pause control, no autoplay |
| Motion | Respect `prefers-reduced-motion` |
