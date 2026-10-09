# Real-time plotting (MQTT / WebSocket)

Moved verbatim from the SKILL.md body (was §7).

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
