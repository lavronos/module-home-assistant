# LavronOS Home Assistant Module

Independent LavronOS module package for Home Assistant bridge data and
dashboard runtime.

The module owns its page, dashboard widget, settings UI and server runtime.
LavronOS stores user-entered settings in its encrypted SQLite settings table
so module updates do not overwrite them.

The release workflow validates `module.json`, creates a versioned ZIP and
publishes it from tags matching the module version. The LavronOS WordPress
Marketplace periodically synchronizes published GitHub Releases from this
repository.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```bash
git tag -a v0.3.6 -m "Release Home Assistant module 0.3.6"
git push origin main
git push origin v0.3.6
```

No WordPress credentials are required in this repository.
