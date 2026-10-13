# Data Visualization Design

Charts, tables, data displays that communicate clearly.

## Chart Selection

| Data Type | Best Chart | Avoid |
|-----------|-----------|-------|
| Part-to-whole | Pie (≤5 slices), stacked bar | Pie with many slices |
| Change over time | Line chart, area chart | Pie chart |
| Comparison (few items) | Bar chart (horizontal or vertical) | Line chart |
| Comparison (many items) | Horizontal bar chart | Vertical bars (labels hard) |
| Distribution | Histogram, box plot | Pie chart |
| Correlation | Scatter plot | Line chart |
| Composition over time | Stacked area, stacked bar | Multiple pie charts |

### When NOT to chart — simple number sometimes better

- Single data point → big number display
- Two numbers to compare → side-by-side with % change
- Very few data points → table might be clearer

```
✗ Pie chart with 2 slices (73% vs 27%)
✓ "73% of users completed onboarding"
```

## Bar Charts

Vertical bars: few categories, short labels.
Horizontal bars: many categories or long labels.

Rules:
- Always start at zero — truncated axes mislead
- Order meaningfully — by value (descending) or logical (time, alphabet)
- Gap between bars = 50-100% of bar width
- Label directly — values on bars, not legend
- 5-7 bars max; group rest as "Other"

```css
.bar {
  fill: var(--primary);
  border-radius: 2px 2px 0 0; /* Slight rounding on top only */
}
.bar:hover {
  fill: var(--primary-dark);
}
/* Spacing */
.bar-gap: 8px;
.bar-width: 32px;
```

## Line Charts

Use for: continuous data over time; trends > individual values; comparing series over same period.

Rules:
- Y-axis at zero (usually) — unless all values in narrow range
- 4-5 lines max — more unreadable
- Distinct line styles — different colors, dashes for printing
- Label lines directly — not just legend
- Highlight important points — events, thresholds

```css
.line {
  stroke-width: 2px;
  fill: none;
}
.data-point {
  r: 4px;
  fill: white;
  stroke-width: 2px;
}
/* Points only on hover or few data points */
.data-point { opacity: 0; }
.line-group:hover .data-point { opacity: 1; }
```

## Pie Charts

Use (rarely): parts of whole, 2-5 slices max, proportions > exact values, values sum to 100%.

NOT for: comparing values (bar), >5 categories, non-100% sums, change over time.

Rules:
- Max 5 slices; small values → "Other"
- Order by size — largest at 12 o'clock
- Label directly on/near slices, not legend
- Show percentages
- Consider donut — center shows total or key metric

Alternative — simple numbers often clearer:
```
┌─────────────────────────────────┐
│ 67% Mobile   23% Desktop   10% Tablet │
└─────────────────────────────────┘
```

## Color in Data Visualization

### Categorical (distinct hues)

```
Blue:    #3b82f6
Orange:  #f97316
Green:   #22c55e
Purple:  #8b5cf6
Yellow:  #eab308
```

- Max 5-7 distinct colors
- No red/green together (colorblindness)
- Test with colorblind simulator

### Sequential (continuous low→high, single hue, varying lightness)

```
Light:   #dbeafe (low values)
         #93c5fd
         #60a5fa
         #3b82f6
Dark:    #1d4ed8 (high values)
```

### Diverging (meaningful center: positive/negative, above/below average)

```
Negative:  #ef4444 (red)
Neutral:   #f3f4f6 (gray)
Positive:  #22c55e (green)
```

### Colorblind-safe

Test with Coblis simulator or Chrome DevTools rendering settings.
Safe combos: Blue + Orange (deuteranopia safe), Blue + Yellow, Purple + Green + Orange.

## Tables

Tables beat charts when: precise values matter, users look up specific data, multiple attributes per item, data gets exported/copied.

### Design principles

1. Numbers right-aligned:
```
Revenue
────────
  $1,234
 $12,456
$123,789
```

2. Text left-aligned.

3. Consistent precision:
```
✗  $1234, $567.89, $2.5k
✓  $1,234.00, $567.89, $2,500.00
```

4. Minimal borders — light horizontal lines only, no vertical borders or heavy lines:
```css
tr {
  border-bottom: 1px solid #e5e7eb;
}
```

5. Generous padding:
```css
td {
  padding: 12px 16px;
}
```

6. Zebra striping:
```css
tr:nth-child(even) {
  background-color: #f9fafb;
}
```

7. Hover highlighting:
```css
tr:hover {
  background-color: #f3f4f6;
}
```

8. Sortable columns:
```html
<th>
  Revenue
  <button aria-label="Sort by revenue">▼</button>
</th>
```

9. Sticky headers:
```css
thead th {
  position: sticky;
  top: 0;
  background: white;
}
```

## Dashboard Layout

```
┌──────────────────────────────────────────────────────┐
│ KEY METRICS (big numbers)                             │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│ │ $45.2K  │ │  1,234  │ │  78.3%  │ │  4.2    │      │
│ │ Revenue │ │  Users  │ │  Conv.  │ │  Rating │      │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
├──────────────────────────────────────────────────────┤
│ PRIMARY CHART (most important trend)                  │
│ ┌──────────────────────────────────────────────┐     │
│ │                                              │     │
│ │         [Line chart: Revenue over time]      │     │
│ │                                              │     │
│ └──────────────────────────────────────────────┘     │
├──────────────────────────┬───────────────────────────┤
│ SUPPORTING CHARTS        │ DETAIL TABLE              │
│ ┌──────────────────┐     │ ┌───────────────────────┐ │
│ │  [Bar chart]     │     │ │ Recent Transactions   │ │
│ └──────────────────┘     │ │ ...                   │ │
│ ┌──────────────────┐     │ │ ...                   │ │
│ │  [Donut chart]   │     │ └───────────────────────┘ │
│ └──────────────────┘     │                           │
└──────────────────────────┴───────────────────────────┘
```

### Key metric cards

```html
<div class="metric-card">
  <span class="label">Revenue</span>
  <span class="value">$45,234</span>
  <span class="change positive">↑ 12.3%</span>
</div>
```

```css
.metric-card {
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.value {
  font-size: 2rem;
  font-weight: 600;
}

.change.positive { color: #22c55e; }
.change.negative { color: #ef4444; }
```

## Chart Annotations

Annotate to: explain anomalies, mark significant events, highlight thresholds, call out key insights.

Event markers:
```
                    ╭─── Product launch
Revenue ──────────/│\──────────────
                    │
```

Threshold lines:
```
Revenue ──────────────────────
- - - - - Target: $50k - - - -
──────────────────────────────
```

Callout boxes:
```
┌──────────────────────────┐
│ + Best month ever!      │
│ +47% vs. last year       │
└─────────────┬────────────┘
              │
              ▼
```

## Accessibility in Data Viz

- Never color alone — add patterns, labels, icons
- Sufficient contrast; colorblind simulator testing

Screen reader support:
```html
<figure role="img" aria-label="Bar chart showing monthly revenue">
  <figcaption class="sr-only">
    Revenue by month: January $10,000, February $12,000...
  </figcaption>
  <svg>...</svg>
</figure>
```

Data table alternative for complex charts:
```html
<details>
  <summary>View data as table</summary>
  <table>...</table>
</details>
```

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| 3D charts | Distorts perception | Flat 2D |
| Dual Y-axes | Confusing comparisons | Separate charts |
| Too many colors | Visual noise | Limit 5-7 |
| Missing zero | Misleading differences | Start at zero |
| No labels | Hard to interpret | Label directly |
| Decorative elements | Chartjunk distracts | Remove non-data ink |
| Inconsistent scales | Misleading comparison | Match scales |

## Quick Reference

### Chart decision tree

```
What do you want to show?
│
├─ Comparison → Bar chart
│
├─ Change over time → Line chart
│
├─ Part of whole → Pie (≤5) or stacked bar
│
├─ Distribution → Histogram
│
├─ Relationship → Scatter plot
│
└─ Single value → Big number
```

### Minimum viable chart styling

```css
/* Axes */
.axis line, .axis path {
  stroke: #e5e7eb;
}
.axis text {
  fill: #6b7280;
  font-size: 12px;
}

/* Grid */
.grid line {
  stroke: #f3f4f6;
}

/* Data */
.bar, .line, .point {
  fill: #3b82f6;
  stroke: #3b82f6;
}

/* Labels */
.label {
  fill: #374151;
  font-size: 11px;
}
```
