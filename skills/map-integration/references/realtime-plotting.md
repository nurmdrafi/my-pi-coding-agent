# Real-time plotting (MQTT / WebSocket)

Established pattern (search repo for `mqtt.connect` + any batching util before writing new):

- Connect with `mqtt.connect(brokerUri, { username, password })` from env vars (broker host/port/protocol — wss for browsers).
- **Buffer + batch, never dispatch per message**: buffer into ref, flush on batch size (~100 msgs) or timer (~100ms), memory cap on markers (LRU ~3000). Batch-processor class exists → reuse. Latest-fix-per-entity feeds: key buffer `Map<entityId, payload>` — bounded by entity count, no array spread per message.
- Track subscribed topics in ref `Set` (no double-subscribe); `isConnectedRef` guard; cleanup `client.end(true)` on unmount + `cancelled` flag around any async-before-connect step so client created mid-unmount is ended immediately.
- Business-hours/off-hours suppression belongs in data hook, not map component.
- Repo has `buildMqttConnection(topic)` util (e.g. `trace-mqtt-dashboard/src/utils/mqttUtils.ts`) → route every connection through it — broker env, auth, topic conventions encoded there; never hand-roll `mqtt.connect` next to it.
- Broker URL + client opts from ONE config source (protocol/host/port from env): mqtt.js spreads opts over parsed URL — hardcoded `protocol: 'wss'` in opts silently overrides `ws://` URL (breaks local dev); handle empty-port case once, centrally.
- Bound every live-feed buffer client-side: cap events/markers array (drop oldest). Unbounded `[event, ...prev]` prepend with O(n) copy per event grows forever on long-lived/wall-display pages.
- Auth teardown must stop batch processor in same action (cancel timer, clear refs), not rely on unmount — flush between store reset and unmount repopulates freshly cleared state with old tenant's markers.
- Typical backend pipeline: MQTT → queue (Redis/BullMQ) → DB + geofence store (e.g. Tile38). Live reads hit geofence store; historical via API endpoints.
