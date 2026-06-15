# LavronOS Home Assistant Module

Independent LavronOS module package for Home Assistant bridge data and
dashboard runtime.

The module owns its page, dashboard widget, settings UI and server runtime.
Its runtime page restores the complete LavronOS v0.11 Home Assistant interface
with bridge health, rooms, devices, entities, automations, scenes, scripts,
sensors and recent events. Before pairing, it shows one setup screen linked
directly to the module settings. The page and dashboard widget are rendered
entirely by this package.
LavronOS stores user-entered settings in its encrypted SQLite settings table
so module updates do not overwrite them.

The release workflow validates `module.json`, creates a versioned ZIP and
publishes it from tags matching the module version. The LavronOS WordPress
Marketplace periodically synchronizes published GitHub Releases from this
repository.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```bash
git tag -a v0.3.8 -m "Release Home Assistant module 0.3.8"
git push origin main
git push origin v0.3.8
```

No WordPress credentials are required in this repository.
