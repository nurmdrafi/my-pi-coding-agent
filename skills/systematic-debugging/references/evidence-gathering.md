# Evidence gathering in multi-component systems

Phase 1, step 4 detail — gathered from the SKILL.md body. Read when the system
has multiple components (CI → build → signing, API → service → database) or an
intermittent external-API failure.

**BEFORE proposing fixes, add diagnostic instrumentation:**
```
For EACH component boundary:
  - Log what data enters component
  - Log what data exits component
  - Verify environment/config propagation
  - Check state at each layer

Run once to gather evidence showing WHERE it breaks
THEN analyze evidence to identify failing component
THEN investigate that specific component
```

**Example (multi-layer system):**
```bash
# Layer 1: Workflow
echo "=== Secrets available in workflow: ==="
echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

# Layer 2: Build script
echo "=== Env vars in build script: ==="
env | grep IDENTITY || echo "IDENTITY not in environment"

# Layer 3: Signing script
echo "=== Keychain state: ==="
security list-keychains
security find-identity -v

# Layer 4: Actual signing
codesign --sign "$IDENTITY" --verbose=4 "$APP"
```

**This reveals:** Which layer fails (secrets → workflow ✓, workflow → build ✗)

**Intermittent external-API failure that "works in my tool":** inspect response headers for throttle counters (`x-ratelimit-limit`, `x-ratelimit-remaining`, `retry-after`). Per-IP rate limits fire only from the production caller — a server proxying all users through one egress IP trips the cap at traffic peaks, while Postman/curl from a dev machine uses a different IP and stays under it. Confirm by hammering the endpoint past the stated limit from the failing caller's network and watching responses flip to 429 exactly at the cap. A catch-all that rethrows one generic message hides which class fired — read the status before trusting the user-facing message.
