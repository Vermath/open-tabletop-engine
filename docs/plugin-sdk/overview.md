# Plugin SDK

Plugins declare a manifest, requested permissions, UI panels, and optional chat commands. The runtime grants only declared capabilities.

See:

- `packages/plugin-sdk`
- `plugins/example-macro-plugin`

Plugin state mutation should happen through proposals unless the permission grant explicitly allows a direct API call.
