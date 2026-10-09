# Known map bugs / pitfalls (fixed before — keep the guards)

Moved verbatim from the SKILL.md body (was §5). Pitfall numbers are stable —
SKILL.md references them as `known-pitfalls.md #N`.

1. **`Cannot read properties of undefined (reading 'featuresets')`** — `queryRenderedFeatures` throws if style/layers aren't loaded. Guard every call:
   ```ts
   const queryFeatures = (point) => {
     try {
       const m: any = mapRef?.current
       if (!m || !m.isStyleLoaded?.()) return []
       return m.queryRenderedFeatures(point) || []
     } catch { return [] }
   }
   ```
   (Guard pattern reused across deck.gl-over-map components — apply the same fix anywhere `queryRenderedFeatures` is called.)
2. **mapbox-gl v3 transitive drift** — pin `mapbox-gl@1.13.3` as explicit dep or alias to maplibre.
3. **flyTo with invalid coords** — validate lat/lon before dispatch + `flyTo({ center: [lon, lat] })`; note **[lng, lat] order everywhere**.
4. **Geolocation** — use a shared validation helper for device position (auto-locate and current-location button share it); never trust raw `position.coords`.
5. **Draw/edit polygon sync (MapboxDraw)** — needs a draw INSTANCE (#10a); the sync must be an idempotent upsert (`_syncEditPolygon`) triggered by ALL of: draw instance appearing, `drawObj` changing, edit-mode enable transition. Never a bare one-shot flag (kills later drawObj updates → stale polygon on next zone edit), never presence-check-only (re-adds after user deletes), never on-every-update (stacks `draw.update` listeners — remove-then-add or its own one-shot).
6. **Geometry load for the selected entity** — staleness guard (cancelled flag / compare requested id) AND a `.catch` clearing the previous entity's geometry: a late OR failed load must never leave entity A's polygon savable against entity B. Reset paths (clear polygon, hierarchy change) clear EVERYTHING derived: drawObj, geoJsonData, polygonData, centerPoint, loadedId.
7. **Draggable marker with no `dragend` capture** — the drag visually succeeds but the parent state still holds the pre-drag coordinates, so Save writes the old location. Attach `marker.on('dragend', () => setState(marker.getLngLat()))` at EVERY creation site (click-placement and initial-data placement), or set `draggable: false`.
8. **Engine clear without state clear** — `draw.delete`/trash and clear-draw handlers that only call `draw.deleteAll()` leave the deleted shape in parent state: the next submit silently re-saves it. Call the parent setter (`setPolygon({})`) in the same handler, and compute WKT/geometry at submit time from current state — never cache it in a set-once variable (a `&& !cached` guard freezes the first shape forever).
9. **react-bkoi-gl exports React components, not constructors** — `new Map(...)` / `new Marker(...)` imported from `react-bkoi-gl` throw "not a constructor": every export named like an engine class (`Map`, `Marker`, `Popup`, `NavigationControl`, `FullscreenControl`) is a `React.FC`; only types + a few utils (`getVersion`, `setWorkerUrl`, `LngLat`, …) are re-exported. Imperative code (legacy class components, hand-built maps) must import the vanilla `bkoi-gl` package instead — switching a component between the two styles is a rewrite, not an import swap. Also: `MapRef` proxies engine methods but SKIPS `addSource/addLayer/removeSource/removeLayer/setFilter/setStyle…` — go through `mapRef.current.getMap()` for source/layer mutation.
10. **DrawControl is callback-only (no instance)** — react-bkoi-gl vendors `maplibre-gl-draw` INLINE in its dist (not a dependency, not exported, no ref forwarding), so `draw.add/deleteAll/getAll/changeMode` are unreachable through it. Two valid architectures:
    - **(a) imperative**: keep `@mapbox/mapbox-gl-draw` and get the raw instance with `useControl(() => new MapboxDraw(...))` (the hook IS exported and returns the control). Required for #5 vertex-editing of preloaded geometry.
    - **(b) pure wrapper**: `<DrawControl onDrawCreate/onDrawUpdate/onDrawDelete>` (events deliver `e.features` — build the FeatureCollection yourself, matching the old `draw.getAll()` shape), clear by re-keying/remounting the control, preload existing geometry as a read-only `<Source>/<Layer>` preview the user redraws over. Costs vertex-editing of existing shapes — upstream closed that support as "not planned"; this wrapper pattern is the accepted answer. Make that regression explicit to the user; it is invisible in code review.
11. **Draw toolbar CSS class mismatch** — `@mapbox/mapbox-gl-draw` renders `mapboxgl-ctrl-*` DOM and its own CSS contains ZERO base-control rules; `react-bkoi-gl/styles` covers `maplibregl-ctrl-*` plus `.mapbox-gl-draw_*` buttons only. The old CDN `bkoi-gl.css` shipped `mapboxgl-*` aliases — so removing the CDN stylesheet blanks the @mapbox draw toolbar (invisible buttons → "cannot draw"). Fix: compat CSS for `.mapboxgl-ctrl-group`, or move to the wrapper's DrawControl (its vendored buttons are styled).
12. **turf rejects degenerate rings** — `centerOfMass`/`polygon()` throw `Each LinearRing of a Polygon must have 4 or more Positions` on real DB geometries; one bad zone crashes a whole selection flow. Validate rings (≥4 positions) before turf and return undefined instead of throwing; never hand-turf a pseudo-geometry built by flatMapping rings where polygons belong — it works only until one ring is degenerate.
