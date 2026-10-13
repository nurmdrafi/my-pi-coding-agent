# Advanced Design Patterns

Extended reference, complex scenarios. Load only when deeper guidance needed.

## Empty States

Empty states = opportunities, not afterthoughts.

Good empty states:
- Illustration or icon (not generic)
- Clear explanation of what goes here
- Primary action to remedy emptiness
- Optional secondary actions

```
✗ "No items"
✓ "No projects yet. Create your first project to get started."
   [+ Create Project]
```

Match tone: todo app can be playful; enterprise dashboard professional.

## Form Design

### Input sizing (match expected content)

- Email/URL: full width or ~400px
- Phone: ~200px
- ZIP: ~100px
- Street address: full width
- City: ~200px
- State dropdown: ~150px

### Placeholder vs. label

**Never placeholder as only label** — disappears on focus. Always visible label.

Placeholders for: format hints ("MM/DD/YYYY"), examples ("e.g., john@example.com"), optional clarification.

### Input states

```
Default:     border-gray-300
Focus:       border-blue-500 ring-2 ring-blue-200
Error:       border-red-500 ring-2 ring-red-200
Disabled:    bg-gray-100 text-gray-400
Success:     border-green-500 (sparingly)
```

### Button hierarchy

One primary action per view; rest secondary/tertiary.

```
Primary:    Solid color, high contrast (bg-blue-600 text-white)
Secondary:  Outlined or muted (border border-gray-300)
Tertiary:   Text only (text-blue-600 hover:underline)
Danger:     Red but not screaming (bg-red-600 for confirm, text-red-600 for trigger)
```

### Form layout

- One column for simple forms
- Two columns ONLY for related inputs (First/Last name, City/State)
- Labels above inputs on mobile, beside on desktop (optional)
- Group related fields with subtle boundaries or spacing

## Image Treatment

### Background images — text over images often unreadable. Solutions:

- Semi-transparent overlay: `bg-black/50`
- Gradient overlay: `bg-gradient-to-t from-black/80 to-transparent`
- Text shadow: `text-shadow: 0 2px 4px rgba(0,0,0,0.5)`
- Solid color box behind text
- Choose images with natural dark/simple areas for text

### User avatars

- Always fallback (initials, generic icon)
- Consistent size per context (32px list, 48px card, 96px profile)
- Round for people, square + border-radius for companies/products
- Border adds polish: `ring-2 ring-white` for overlapping avatars

### Hero images

- Never stretch — `object-cover`
- `aspect-ratio` for consistency
- Compress appropriately (WebP, quality 80%)

## Icon Usage

### Sizing (balanced with adjacent text)

- 12-14px text: 16px icon
- 16px text: 20px icon
- 18-20px text: 24px icon

### Icon + text pairing

Align icon center with text baseline/center; consistent gap (8px typical).

```html
<span class="flex items-center gap-2">
  <IconSettings class="w-5 h-5" />
  <span>Settings</span>
</span>
```

### Use icons for

- Navigation items
- Common actions (edit, delete, share)
- Status indicators
- Feature lists (caution — don't overdo)

### NOT for

- Filling space
- Buttons with clear text ("Submit", "Continue")
- Decorative-only, no meaning

## Interaction States

Every interactive element needs visible state changes:

- **Hover**: subtle bg change, slight shadow increase, color shift (darken primary 10%)
- **Active/Pressed**: darker than hover, slight scale down (`scale-95`), reduced shadow
- **Focus**: obvious ring (critical for a11y), never color alone, `focus-visible` for keyboard-only
- **Loading**: disable interaction, spinner/skeleton, maintain layout size (prevent shift)

```css
/* Example button states */
.btn {
  @apply bg-blue-600 hover:bg-blue-700 active:bg-blue-800;
  @apply focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2;
  @apply disabled:opacity-50 disabled:cursor-not-allowed;
}
```

## Color Psychology

| Color | Association | Use for |
|-------|-------------|---------|
| Blue | Trust, calm, professional | Primary actions, links, corporate |
| Green | Success, growth, go | Success states, positive actions |
| Red | Error, danger, urgency | Errors, destructive actions, alerts |
| Yellow/Orange | Warning, attention | Warnings, highlights |
| Purple | Premium, creative | Premium features, creative apps |
| Gray | Neutral, professional | Text, backgrounds, borders |

Avoid:
- Red for non-destructive primary buttons
- Green for errors (colorblind users)
- Low-saturation colors for important actions
- More than 3 accent colors per interface

## Border Radius System

Stay consistent. Pick a system:

Sharp/Modern:
```
none: 0
sm: 2px
md: 4px
lg: 6px
full: 9999px (pills/circles)
```

Soft/Friendly:
```
none: 0
sm: 4px
md: 8px
lg: 12px
xl: 16px
full: 9999px
```

Rules:
- Nested elements: inner radius = outer radius − padding
- Small elements smaller radius (badges, tags); large elements larger (cards, modals)
- Images inside cards: match card radius or `overflow-hidden`

## Text Wrapping & Truncation

### Truncate when

- Navigation items
- Table cells with fixed widths
- Card titles (hover to reveal)

```css
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### Never truncate

- Body text, important info, search results, error messages

### Multi-line

```css
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

## Responsive Breakpoints

Tailwind default:

```
sm:  640px  (landscape phones)
md:  768px  (tablets)
lg:  1024px (laptops)
xl:  1280px (desktops)
2xl: 1536px (large screens)
```

Mobile-first principles:
- Design mobile first, add complexity for larger screens
- Stack on mobile, side-by-side on desktop
- Full-width inputs mobile, constrained desktop
- Larger touch targets mobile (44px minimum)
- Hide secondary nav in hamburger on mobile

## Modal and Overlay Patterns

### Modal sizing

| Content Type | Width | Height |
|--------------|-------|--------|
| Confirmation dialog | 400-500px | Auto (minimal) |
| Form modal | 500-600px | Auto |
| Content modal | 600-800px | 70-80vh max |
| Full-screen modal | 100vw | 100vh |

### Structure

```
┌─────────────────────────────────────────────┐
│  Title                              ✗ Close │
├─────────────────────────────────────────────┤
│                                             │
│  Modal content here                         │
│                                             │
├─────────────────────────────────────────────┤
│                     Cancel    Primary Action│
└─────────────────────────────────────────────┘
```

### Backdrop

```css
.backdrop {
  background: rgba(0, 0, 0, 0.5);
  /* Or with blur */
  backdrop-filter: blur(4px);
}
```

### Transitions

```css
/* Fade + Scale */
.modal {
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.modal.open {
  opacity: 1;
  transform: scale(1);
}
```

## Dropdown and Menu Design

### Positioning

- Default: below trigger, left-aligned
- Flip above if no space below
- Constrain to viewport

```css
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
}
```

### Styling

```css
.menu {
  min-width: 180px;
  max-height: 300px;
  overflow-y: auto;
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
}

.menu-item {
  padding: 8px 12px;
  cursor: pointer;
}

.menu-item:hover {
  background: #f3f4f6;
}

.menu-divider {
  height: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}
```

### Item types

| Type | Visual |
|------|--------|
| Standard | Text label |
| With icon | Icon + Label |
| With shortcut | Label + Shortcut |
| With description | Label + Description |
| Destructive | Red text |
| Disabled | Grayed out |

## Navigation Patterns

### Top navigation

```
┌─────────────────────────────────────────────────┐
│  Logo    Nav Item   Nav Item   Nav Item    CTA  │
└─────────────────────────────────────────────────┘
```

Sticky on scroll (optional); hamburger on mobile; clear active state.

### Side navigation

```
┌──────────────┬──────────────────────────────────┐
│  Logo        │                                  │
│              │                                  │
│  Dashboard   │         Main Content             │
│  Projects    │                                  │
│  Settings    │                                  │
│              │                                  │
│  ─────────   │                                  │
│  Account     │                                  │
│  Logout      │                                  │
└──────────────┴──────────────────────────────────┘
```

Collapsible to icons on desktop; full overlay on mobile; group related items.

### Breadcrumbs

```
Home  >  Category  >  Subcategory  >  Current Page
```

Clickable except current; truncate middle if too long; show on detail/nested pages.

### Tabs

```css
.tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
}

.tab {
  padding: 12px 16px;
  border-bottom: 2px solid transparent;
}

.tab.active {
  border-bottom-color: #3b82f6;
  color: #3b82f6;
}
```

Underline or pill style; horizontal scroll on mobile if many tabs; vertical tabs for settings.
