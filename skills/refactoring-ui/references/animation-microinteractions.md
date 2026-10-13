# Animation & Microinteractions

When/how to animate UI effectively.

## The Purpose of Animation

Animation serves function, not looks.

### Valid reasons

| Purpose | Example |
|---------|---------|
| **Feedback** | Button press confirmation, form submission success |
| **Orientation** | Showing where something came from / went |
| **Focus** | Drawing attention to important changes |
| **Teaching** | Demonstrating how something works |
| **Continuity** | Maintaining context during state changes |
| **Delight** | Occasional surprise (sparingly) |

### Invalid reasons

- "Looks cool" / "competition does it" / "show off skills"
- Every state change
- Hiding slow performance

## Timing & Duration

| Animation Type | Duration | Rationale |
|----------------|----------|-----------|
| Micro-feedback (hover, press) | 100-150ms | Must feel instant |
| Simple transitions (fade, slide) | 150-250ms | Noticeable but quick |
| Complex transitions (modal, navigation) | 250-350ms | Need time to follow |
| Entrances/Reveals | 200-400ms | Can be slightly longer |
| Decorative/Emphasis | 300-500ms | Purpose is to be noticed |

### The 200ms rule

Most UI animations ~200ms. Faster than 100ms → imperceptible. Slower than 400ms → sluggish, interrupts flow. Exception: loading/progress indicators can be slower (represent real waiting).

### Duration by distance

Longer travel = longer duration (not proportionally).

```
Small movement (8-16px):   100-150ms
Medium movement (50-100px): 150-250ms
Large movement (full screen): 250-350ms
```

## Easing Functions

Easing = natural motion. Linear = robotic.

| Easing | Use For | Feel |
|--------|---------|------|
| **ease-out** | Elements entering | Fast start, gentle stop |
| **ease-in** | Elements leaving | Gentle start, fast exit |
| **ease-in-out** | Elements moving within view | Smooth throughout |
| **linear** | Progress indicators, opacity changes | Mechanical (intentional) |

### Ease-out (default entrances — modals, notifications, dropdowns, tooltips):
```css
transition: transform 200ms ease-out;
```

### Ease-in (exits — modals dismissing, fading, notifications leaving):
```css
transition: opacity 150ms ease-in;
```

### Ease-in-out (on-screen movement — tab indicators, carousels, drawers):
```css
transition: transform 250ms ease-in-out;
```

### Custom cubic bezier (personality):

```css
/* Snappy entrance */
transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);

/* Smooth overshoot */
transition: transform 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

## Common Animation Patterns

### Button states

```css
/* Hover */
.btn {
  transition: background-color 100ms ease-out, transform 100ms ease-out;
}
.btn:hover {
  background-color: var(--btn-hover);
}

/* Active/Pressed */
.btn:active {
  transform: scale(0.97);
}

/* Loading */
.btn.loading {
  opacity: 0.7;
  pointer-events: none;
}
.btn.loading .spinner {
  animation: spin 1s linear infinite;
}
```

### Modal entrance/exit

```css
/* Enter */
.modal {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.modal.open {
  opacity: 1;
  transform: scale(1) translateY(0);
}

/* Exit */
.modal.closing {
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 150ms ease-in, transform 150ms ease-in;
}
```

### Dropdown/Menu

```css
.dropdown {
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  transition: opacity 150ms ease-out, transform 150ms ease-out;
}
.dropdown.open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
```

### Toast/Notification

```css
.toast {
  transform: translateX(100%);
  transition: transform 300ms ease-out;
}
.toast.visible {
  transform: translateX(0);
}
.toast.exiting {
  transform: translateX(100%);
  transition: transform 200ms ease-in;
}
```

### Skeleton loading

```css
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

## Loading States

| Type | Use When | Example |
|------|----------|---------|
| **Spinner** | Unknown duration, short wait expected | Button submission |
| **Progress bar** | Known progress, longer operations | File upload |
| **Skeleton** | Loading content layout | Feed items |
| **Pulse/Shimmer** | Refreshing existing content | Pull to refresh |

### Spinner guidelines

- Don't show immediately (wait 300-500ms)
- Wait < 1 second → spinner may be unneeded
- Position in context (where content appears)
- Cancel option for long operations

```jsx
// Delay spinner to avoid flash for fast operations
const [showSpinner, setShowSpinner] = useState(false);

useEffect(() => {
  if (isLoading) {
    const timer = setTimeout(() => setShowSpinner(true), 400);
    return () => clearTimeout(timer);
  }
  setShowSpinner(false);
}, [isLoading]);
```

### Progress bar guidelines

- Percentage when meaningful
- Never jump backwards
- Indeterminate state if progress unknown
- Complete to 100% before hiding

### Skeleton screen guidelines

- Match actual content layout
- Consistent bone shapes
- Animate subtly (shimmer, not bounce)
- Replace with content immediately when loaded

## Microinteractions

Small animations giving feedback + delight.

### Toggle switch:
```css
.toggle-thumb {
  transition: transform 150ms ease-out;
}
.toggle.on .toggle-thumb {
  transform: translateX(20px);
}
```

### Checkbox check:
```css
.checkmark {
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
  transition: stroke-dashoffset 200ms ease-out;
}
.checkbox.checked .checkmark {
  stroke-dashoffset: 0;
}
```

### Like/heart:
```css
.heart {
  transform: scale(1);
  transition: transform 150ms ease-out;
}
.heart.liked {
  animation: pop 300ms ease-out;
}
@keyframes pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
```

### Input focus:
```css
.input {
  border-color: #ccc;
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
}
.input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}
```

### When they help

- Confirming user action occurred
- Showing state change clearly
- Making interface feel responsive
- Guiding attention to changes

### When to skip

- Repetitive actions (every keystroke)
- Performance-critical paths
- Accessibility mode (respect reduce-motion)

## Accessibility

### Respect user preferences

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Provide alternatives

- Never rely on animation alone to convey information
- State changes visible without animation
- Allow disabling animations in app settings

### Avoid

| Avoid | Reason |
|-------|--------|
| Flashing/strobing | Can trigger seizures |
| Parallax scrolling | Motion sickness |
| Auto-playing video | Distracting, accessibility |
| Infinite loops | Drains attention, battery |

## Performance

### GPU-accelerated properties (smooth 60fps)

- `transform` (translate, scale, rotate)
- `opacity`

Avoid animating (reflow/repaint): `width`, `height`, `top/left/right/bottom`, `margin`, `padding`, `border-width`, `font-size`.

### will-change sparingly

```css
/* Only for elements about to animate */
.modal {
  will-change: transform, opacity;
}

/* Remove after animation */
.modal.static {
  will-change: auto;
}
```

### Batch animations

Start together, not staggered excessively: 0-50ms stagger = cohesive; 100ms+ = slow, sequential.

### Test on low-end devices

Smooth on MacBook may stutter on budget Android. Test on real devices or throttle CPU in DevTools.

## Checklist

- [ ] Serves a purpose (not just decoration)?
- [ ] Duration appropriate for action?
- [ ] Easing natural?
- [ ] Works with `prefers-reduced-motion`?
- [ ] GPU-accelerated (transform/opacity)?
- [ ] Performs on low-end devices?
- [ ] Interface functions without it?
