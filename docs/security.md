# Security

- Security is build-time: mutating routes carry auth/permission checks when first written; secrets stay server-side.
- Guard/effect fixes re-check adjacent paths they unblocked.
