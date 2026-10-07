---
name: map-integration
description: "ANY map work, Barikoi stack included: react-bkoi-gl / bkoi-gl (Barikoi's maplibre wrappers), maplibre-gl/mapbox-gl and react-map-gl-family wrappers, deck.gl overlays, turf geometry, draw polygons/polylines, camera flyTo/fitBounds, geolocation, MQTT real-time plotting, GPX routes, snap-to-road (OSRM), boundary layers, Barikoi map styles and barikoi.xyz APIs, map bugs (style-load, marker drift), map key leaks (api key in client bundle, hardcoded barikoi key, key shipped to browser). Detects stack from package.json; reuses existing idioms."
disable-model-invocation: true
---

# Map Integration

## 1. Detect the stack first — never assume

Check the project's `package.json`, bundler aliases, and existing map components before writing anything. Stack families found across this workspace:

- `react-bkoi-gl` (current gen — Barikoi's React wrapper): react-map-gl-style API (`Map`, `useMap`, `useControl`, `Source`/`Layer`) plus `DrawControl` (draw built in — but callback-only, see §5.10), `MinimapControl`/`Minimap`, `GlobeControl`, `TerrainControl`, `LogoControl`, `CanvasSource`. The engine (`maplibre-gl@6`) ships as its own dependency — import everything from `react-bkoi-gl`, never `maplibre-gl` directly; engine utils are re-exported. **Its `Map`/`Marker`/`Popup`/controls are React components — engine constructors are NOT exported** (§5.9), so imperative code (`new Map(...)`, `marker.on('dragend')`) can't run on it. CSS: `import "react-bkoi-gl/styles"`.
- `bkoi-gl` (vanilla JS — Barikoi's build of MapLibre v6): the engine constructors live here (`Map` with `BkoiMapOptions` incl. `accessToken`/`style`). Bundles the engine + a self-contained worker (no maplibre install, no worker hosting); `bkoi-gl/worker` only for strict-CSP apps. CSS: `bkoi-gl/style.css`. For React apps prefer `react-bkoi-gl` — but legacy imperative components (class components hand-building maps) need this package. Note: `bkoi-gl-js` is the CDN dist name (`cdn.barikoi.com/bkoi-gl-js/...`), NOT an npm package; the npm name is `bkoi-gl`.
- Legacy: `react-map-gl` + `maplibre-gl` / `mapbox-gl` (some pin `mapbox-gl@1.13.3` or alias `mapbox-gl → maplibre-gl` in bundler config). Same react-map-gl API surface.
- `@deck.gl/*` (overlays), `@turf/turf` (geometry), `@mapbox/mapbox-gl-draw` (editing), `mqtt` / `socket.io-client` (real-time), `geo-polyline-tools` (route polyline utils).

Sibling dashboards are forks of one shared template — before writing new map code, grep the nearest sibling for the existing idiom.

Do not let `mapbox-gl` drift to v3 via transitive deps — v3 demands a Mapbox token and breaks custom/self-hosted styles.

## 2. Developing a map wrapper library itself

- Engine majors (e.g. maplibre v5→v6) break as **silent render failures** (worker resolution), not type errors — consult the engine's migration guide, then run the README-matrix e2e first for the fastest contract-breakage signal. (bkoi-gl 4.x and react-bkoi-gl 3.x are already on MapLibre v6 — the worker break is why bkoi-gl now bundles a self-contained worker.)
- Consumers never import the engine directly (transitive deps don't resolve under pnpm strict layout or yarn PnP): re-export engine utils (`setWorkerUrl`, `getWorkerUrl`, `getVersion`, `GPUInitializationError`) from the wrapper.
- Package surface: `exports` = `.` (import/require + types), `./styles` or `./style.css` (css), `./worker` (if shipped); peer deps `react`/`react-dom` across all supported React majors. Both current packages match this.
- Framework suite: real repro apps (Vite, Next.js in both bundler modes, CRA…) each installing the **packed tarball, never link**; headless runs assert actual rendering (engine `load` + `idle`, zero uncaught errors). See the sdk-development skill for the full library pipeline (test pyramid, pack smoke, docs-as-contract).
- Wrapper bug guards (fixed once — keep the pattern): strip wrapper-only props (`position`, `style`) before constructing engine controls — a leaked wrapper prop makes engine validation silently reject every toggle. `<Marker>` with a popup-only child keeps the default pin.

## 3. Base map

- `react-map-gl`-family API: `<Map>`, `useMap()`, `useControl()`, `MapRef`, `Source`/`Layer`.
- Auth/config via env vars: map style token, routing API key (separate keys for separate services). Check the project's `.env*` for the naming convention in use; never introduce a provider token the project doesn't already use.

### Barikoi styles and keys

- Style URL pattern: `https://map.barikoi.com/styles/{name}/style.json?key=$BARIKOI_API_KEY` — the key rides as a `?key=` query param. This is the only key channel under react-bkoi-gl (its MapProps has no accessToken field — stock maplibre-gl dep; bkoi-gl's engine Map does accept accessToken). Styles in use: `osm-liberty` (default), `osm_barikoi_v1`, `planet_map`, `barikoi-light`, `barikoi-dark`, `barikoi-dark-mode`. Served by the self-hosted `tileserver-gl` (barikoi/tileserver-gl).
- Style switching: `mapbox-gl-style-switcher` (`MapboxStyleSwitcherControl(styles, { defaultStyle: 'OSM Liberty' })`) mounted via `useControl`, usually wrapped in a `StyleControl` component; style list lives in `App.config` / `app.config` (`MAP.STYLES`).
- Search/geocode/routing/geofence APIs: base `https://barikoi.xyz`, same key (endpoint spec: `barikoiapis/openapi/barikoi-api-spec.yaml`). Docs: docs.barikoi.com; keys: developer.barikoi.com.

## 4. deck.gl overlays (established pattern)

Typical overlay component (search the repo for an existing one and match its shape):

```tsx
import { MapboxOverlay, MapboxOverlayProps } from '@deck.gl/mapbox'
import { IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers/typed'
import { PathStyleExtension } from '@deck.gl/extensions/typed'
import { useControl } from 'react-map-gl'

const DeckGLOverlay = (props: MapboxOverlayProps) => {
  const overlay = useControl(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}
```

- Paths: `PathLayer` with `PathStyleExtension({ dashed })`. Markers: `IconLayer` / `ScatterplotLayer`.
- Performance rules: never `setState` inside `onHover`/view-state callbacks — they fire per frame and rerender the tree; throttle them (the dashboards use `useThrottle(popupData, 250)`). Recreating layer instances each render is fine (deck diffs props), but appending live data must not rebuild the whole buffer — append into a stable structure or emit one layer per chunk.
- Existing layers to reuse before writing new ones (marker/trace/boundary layers) — search the repo for its layer components first.
- The dashboards share one template: `components/Map/DeckGLMap.jsx` (Map shell, `MAP.STYLES[0]`, throttled tooltip) + `OverLayers.jsx` (the DeckGLOverlay above — `useControl` imported from `react-bkoi-gl`) + `Map/Layers/` composite layer classes (`TraceLayer`, `RouteLayer`…), all fed from a Redux slice. Before writing a new one, diff against a sibling dashboard — they are forks of the same shape.

## 5. Known map bugs / pitfalls (fixed before — keep the guards)

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
5. **Draw/edit polygon sync (MapboxDraw)** — needs a draw INSTANCE (§5.10a); the sync must be an idempotent upsert (`_syncEditPolygon`) triggered by ALL of: draw instance appearing, `drawObj` changing, edit-mode enable transition. Never a bare one-shot flag (kills later drawObj updates → stale polygon on next zone edit), never presence-check-only (re-adds after user deletes), never on-every-update (stacks `draw.update` listeners — remove-then-add or its own one-shot).
6. **Geometry load for the selected entity** — staleness guard (cancelled flag / compare requested id) AND a `.catch` clearing the previous entity's geometry: a late OR failed load must never leave entity A's polygon savable against entity B. Reset paths (clear polygon, hierarchy change) clear EVERYTHING derived: drawObj, geoJsonData, polygonData, centerPoint, loadedId.
7. **Draggable marker with no `dragend` capture** — the drag visually succeeds but the parent state still holds the pre-drag coordinates, so Save writes the old location. Attach `marker.on('dragend', () => setState(marker.getLngLat()))` at EVERY creation site (click-placement and initial-data placement), or set `draggable: false`.
8. **Engine clear without state clear** — `draw.delete`/trash and clear-draw handlers that only call `draw.deleteAll()` leave the deleted shape in parent state: the next submit silently re-saves it. Call the parent setter (`setPolygon({})`) in the same handler, and compute WKT/geometry at submit time from current state — never cache it in a set-once variable (a `&& !cached` guard freezes the first shape forever).
9. **react-bkoi-gl exports React components, not constructors** — `new Map(...)` / `new Marker(...)` imported from `react-bkoi-gl` throw "not a constructor": every export named like an engine class (`Map`, `Marker`, `Popup`, `NavigationControl`, `FullscreenControl`) is a `React.FC`; only types + a few utils (`getVersion`, `setWorkerUrl`, `LngLat`, …) are re-exported. Imperative code (legacy class components, hand-built maps) must import the vanilla `bkoi-gl` package instead — switching a component between the two styles is a rewrite, not an import swap. Also: `MapRef` proxies engine methods but SKIPS `addSource/addLayer/removeSource/removeLayer/setFilter/setStyle…` — go through `mapRef.current.getMap()` for source/layer mutation.
10. **DrawControl is callback-only (no instance)** — react-bkoi-gl vendors `maplibre-gl-draw` INLINE in its dist (not a dependency, not exported, no ref forwarding), so `draw.add/deleteAll/getAll/changeMode` are unreachable through it. Two valid architectures:
    - **(a) imperative**: keep `@mapbox/mapbox-gl-draw` and get the raw instance with `useControl(() => new MapboxDraw(...))` (the hook IS exported and returns the control). Required for §5.5 vertex-editing of preloaded geometry.
    - **(b) pure wrapper**: `<DrawControl onDrawCreate/onDrawUpdate/onDrawDelete>` (events deliver `e.features` — build the FeatureCollection yourself, matching the old `draw.getAll()` shape), clear by re-keying/remounting the control, preload existing geometry as a read-only `<Source>/<Layer>` preview the user redraws over. Costs vertex-editing of existing shapes — upstream closed that support as "not planned"; this wrapper pattern is the accepted answer. Make that regression explicit to the user; it is invisible in code review.
11. **Draw toolbar CSS class mismatch** — `@mapbox/mapbox-gl-draw` renders `mapboxgl-ctrl-*` DOM and its own CSS contains ZERO base-control rules; `react-bkoi-gl/styles` covers `maplibregl-ctrl-*` plus `.mapbox-gl-draw_*` buttons only. The old CDN `bkoi-gl.css` shipped `mapboxgl-*` aliases — so removing the CDN stylesheet blanks the @mapbox draw toolbar (invisible buttons → "cannot draw"). Fix: compat CSS for `.mapboxgl-ctrl-group`, or move to the wrapper's DrawControl (its vendored buttons are styled).
12. **turf rejects degenerate rings** — `centerOfMass`/`polygon()` throw `Each LinearRing of a Polygon must have 4 or more Positions` on real DB geometries; one bad zone crashes a whole selection flow. Validate rings (≥4 positions) before turf and return undefined instead of throwing; never hand-turf a pseudo-geometry built by flatMapping rings where polygons belong — it works only until one ring is degenerate.

## 6. Camera idioms

- `mapRef.current?.flyTo({ center: [lon, lat], zoom })` after marker set / selection.
- `fitBounds` for multiple markers — reuse an existing map-bounds util if the project has one.
- Redux/store-driven map state: selection, route mode, playback live in a store slice — map components subscribe, don't duplicate local state.

## 7. Real-time plotting (MQTT / WebSocket)

Established pattern (search the repo for `mqtt.connect` and any batching util before writing new):

- Connect with `mqtt.connect(brokerUri, { username, password })` from env vars (broker host/port/protocol — wss for browsers).
- **Buffer + batch, never dispatch per message**: buffer into a ref, flush on batch size (~100 msgs) or timer (~100ms), with a memory cap on markers (LRU ~3000). If a batch-processor class already exists, reuse it. For latest-fix-per-entity feeds, key the buffer `Map<entityId, payload>` — structurally bounded by entity count, no array spread per message.
- Track subscribed topics in a ref `Set` to avoid double-subscribe; `isConnectedRef` guard; cleanup with `client.end(true)` on unmount, plus a `cancelled` flag around any async-before-connect step so a client created mid-unmount is ended immediately.
- Business-hours / off-hours suppression belongs in the data hook, not the map component.
- If the repo has a `buildMqttConnection(topic)` util (e.g. `trace-mqtt-dashboard/src/utils/mqttUtils.ts`), route every connection through it — broker env, auth, and topic conventions are encoded there; don't hand-roll `mqtt.connect` next to it.
- Build broker URL and client opts from one config source (protocol/host/port from env): mqtt.js spreads opts over the parsed URL, so a hardcoded `protocol: 'wss'` in opts silently overrides a `ws://` URL (breaks local dev); handle the empty-port case once, centrally.
- Bound every live-feed buffer client-side: cap the events/markers array (drop oldest). An unbounded `[event, ...prev]` prepend with an O(n) copy per event grows forever on long-lived/wall-display pages.
- Auth teardown must stop the batch processor in the same action (cancel timer, clear refs), not rely on unmount — a flush between store reset and unmount repopulates freshly cleared state with the old tenant's markers.
- Typical backend pipeline: MQTT → queue (Redis/BullMQ) → DB + geofence store (e.g. Tile38). Live reads can hit the geofence store; historical via API endpoints.

## 8. GPX / route utilities (reuse, don't rewrite)

Search the repo for existing route utils before writing any — mature map projects typically already have: route flattening (LineString + MultiLineString, dropping duplicate points so cumulative distance stays monotonic), traveled-slice (polyline up to km), route-head projection (position + heading along a route), and diverged-segment detection (live vs planned drift). Simplify/distance helpers usually sit alongside.

Common route modes: live / planned / compare, plus playback with speed control (state kept in the map store slice).

Optimized routes: call through a server-side API proxy, keeping the routing API key out of the browser.

## 9. Snap-to-road (OSRM)

- Typical flow: track endpoint with `snap_to_road=true` → track/route service → OSRM matching service. If the project has an OSRM integration, reuse its service module rather than calling OSRM from the browser.
- OSRM is called server-side — no CORS concern, no browser key.
- Frontend just re-renders the polyline when the snap toggle changes.

## 10. Env vars

Read the project's `.env*` for actual names — don't invent. Common shapes: map style token (`NEXT_PUBLIC_MAP_API_ACCESS_TOKEN` / `VITE_MAP_API_ACCESS_TOKEN`), MQTT broker host/port/protocol + auth username/password, routing API key (separate from map token). Barikoi names in use: `BARIKOI_API_KEY` (dominant), `BARIKOI_STYLE_URL`, `BARIKOI_GL_TOKEN`, `BARIKOI_API` / `BARIKOI_API_ENDPOINT`, `NEXT_PUBLIC_MAP_BASE_URL`; legacy mapbox-era: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`.

Browser-visible credentials are public by definition: the style key rides in the style URL, MQTT creds ride in the wss connection. Consequences: restrict keys by allowed origin in the developer dashboard, one key per app/service, and keep privileged keys (routing, geofence CRUD) server-side behind the app's proxy. Restrictive-CSP deployments need a real worker URL, not blob: — that is what the `./worker` exports are for (§1).

## 11. CI for the dashboard family (solved once — keep the pattern)

The shared Production/Staging/Review workflow family across the dashboards was hardened once; do not reintroduce the fixed patterns:

- Secrets reach steps via `with:` only, never workflow-level `env:` — workflow-level env exposes them to every step, including third-party webhook/release actions.
- Third-party actions and reusable workflows are pinned to full commit SHAs (tag as comment), not mutable tags.
- `permissions: contents: read` at workflow level; `contents: write` granted only to the release step that needs it.

For anything beyond this shape, follow the github-actions skill (SHA pinning, least-privilege permissions, secret scoping, actionlint).

## Checklist before writing map code

1. Does an equivalent Layer/hook/util already exist in this repo (or a sibling/fork repo)? Reuse first — sibling dashboards are forks of the same template.
2. Barikoi repos: import map code from `react-bkoi-gl`/`bkoi-gl` only (never `maplibre-gl` directly); style key goes in the `?key=` query param; check a sibling dashboard's DeckGLMap template before starting fresh.
2. Coord order `[lng, lat]`. Validate before flyTo/bounds.
3. Guard `queryRenderedFeatures` / any style-dependent call.
4. Real-time: batch messages, LRU-cap markers, guard subscriptions, cleanup on unmount.
5. Shared map state in a store slice — map components subscribe, don't own.
6. Map wrapper library work: framework apps install the fresh packed tarball (never link); every README claim covered by an e2e case; engine majors = silent render failures — run the README matrix first.
7. Draw/edit flows: idempotent polygon-sync upsert covering all three triggers (§5.5); guarded geometry loads with failure-path clearing (§5.6); resets touch every derived field; markers capture `dragend` and draw-clears propagate to parent state (§5.7–5.8).
8. CI touched: secrets step-scoped, actions SHA-pinned, least-privilege permissions (§11).
9. No provider key literal in source or a bundled config (`app.config.ts` etc.) — keys ride env vars; anything `NEXT_PUBLIC_*` or client-imported is public by definition. Server-side Barikoi/routing calls go through an API proxy, never a client-held key.
