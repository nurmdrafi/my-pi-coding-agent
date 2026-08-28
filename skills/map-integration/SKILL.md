---
name: map-integration
description: "ANY map work: react-bkoi-gl/bkoi-gl/maplibre-gl setup, deck.gl overlays, turf geometry, draw polygons/polylines, camera flyTo/fitBounds, geolocation, MQTT real-time plotting, GPX routes, snap-to-road (OSRM), boundary layers, map bugs (style-load, marker drift). Detects stack from package.json; reuses existing idioms."
---

# Map Integration

## 1. Detect the stack first — never assume

Check the project's `package.json`, bundler aliases, and existing map components before writing anything:

- `react-bkoi-gl` (react-map-gl API over maplibre-gl) — Barikoi maps
- `maplibre-gl` — open base; some projects pin `mapbox-gl@1.13.3` or alias `mapbox-gl → maplibre-gl` in bundler config
- `@deck.gl/*` (overlays), `@turf/turf` (geometry), `@mapbox/mapbox-gl-draw` (editing), `mqtt` / `socket.io-client` (real-time), polyline utilities

Do not let `mapbox-gl` drift to v3 via transitive deps — v3 demands a Mapbox token and breaks custom/self-hosted styles.

## 2. Base map

- `react-bkoi-gl` API mirrors `react-map-gl`: `<Map>`, `useMap()`, `useControl()`, `MapRef`, `Source`/`Layer`.
- Auth/config via env vars: map style token, routing API key (separate keys for separate services). Check the project's `.env*` for the naming convention in use; never introduce a provider token the project doesn't already use.

## 3. deck.gl overlays (established pattern)

From `components/common/map/RouteViewer.tsx` / `OverlayLayers.tsx`:

```tsx
import { MapboxOverlay, MapboxOverlayProps } from '@deck.gl/mapbox'
import { IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers/typed'
import { PathStyleExtension } from '@deck.gl/extensions/typed'
import { useControl } from 'react-bkoi-gl'

const DeckGLOverlay = (props: MapboxOverlayProps) => {
  const overlay = useControl(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}
```

- Paths: `PathLayer` with `PathStyleExtension({ dashed })`. Markers: `IconLayer` / `ScatterplotLayer`.
- Existing layers to reuse before writing new ones (e.g. outlet/marker/trace/boundary layers under `components/common/Map/Layers/`) — search for them first.

## 4. Known map bugs / pitfalls (fixed before — keep the guards)

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

## 5. Camera idioms

- `mapRef.current?.flyTo({ center: [lon, lat], zoom })` after marker set / selection.
- `fitBounds` for multiple markers — reuse an existing map-bounds util if the project has one.
- Redux/store-driven map state: selection, route mode, playback live in a store slice — map components subscribe, don't duplicate local state.

## 6. Real-time plotting (MQTT / WebSocket)

Established pattern (search the repo for `mqtt.connect` and any batching util before writing new):

- Connect with `mqtt.connect(brokerUri, { username, password })` from env vars (broker host/port/protocol — wss for browsers).
- **Buffer + batch, never dispatch per message**: buffer into a ref, flush on batch size (~100 msgs) or timer (~100ms), with a memory cap on markers (LRU ~3000). If a batch-processor class already exists, reuse it.
- Track subscribed topics in a ref `Set` to avoid double-subscribe; `isConnectedRef` guard; cleanup with `client.end(true)` on unmount.
- Business-hours / off-hours suppression belongs in the data hook, not the map component.
- Typical backend pipeline: MQTT → queue (Redis/BullMQ) → DB + geofence store (e.g. Tile38). Live reads can hit the geofence store; historical via API endpoints.

## 7. GPX / route utilities (reuse, don't rewrite)

Search the repo for existing route utils before writing any — mature map projects typically already have: route flattening (LineString + MultiLineString, dropping duplicate points so cumulative distance stays monotonic), traveled-slice (polyline up to km), route-head projection (position + heading along a route), and diverged-segment detection (live vs planned drift). Simplify/distance helpers usually sit alongside.

Common route modes: live / planned / compare, plus playback with speed control (state kept in the map store slice).

Optimized routes: call through a server-side API proxy, keeping the routing API key out of the browser.

## 8. Snap-to-road (OSRM)

- Typical flow: track endpoint with `snap_to_road=true` → track/route service → OSRM matching service. If the project has an OSRM integration, reuse its service module rather than calling OSRM from the browser.
- OSRM is called server-side — no CORS concern, no browser key.
- Frontend just re-renders the polyline when the snap toggle changes.

## 9. Env vars

Read the project's `.env*` for actual names — don't invent. Common shapes: map style token (`NEXT_PUBLIC_MAP_API_ACCESS_TOKEN` / `VITE_MAP_KEY`), MQTT broker host/port/protocol + auth username/password, routing API key (separate from map token).

## Checklist before writing map code

1. Does an equivalent Layer/hook/util already exist in this repo (or a sibling/fork repo)? Reuse first.
2. Coord order `[lng, lat]`. Validate before flyTo/bounds.
3. Guard `queryRenderedFeatures` / any style-dependent call.
4. Real-time: batch messages, LRU-cap markers, guard subscriptions, cleanup on unmount.
5. Shared map state in a store slice — map components subscribe, don't own.
