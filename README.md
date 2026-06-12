# LavronOS Home Assistant Module

Independent LavronOS module package for Home Assistant bridge data and
dashboard runtime.

The release workflow validates `module.json`, creates a versioned ZIP and
publishes it from tags matching the module version. When Marketplace secrets
are configured, the same verified ZIP is imported and approved on the
LavronOS WordPress Marketplace automatically.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

```bash
git tag -a v0.3.5 -m "Release Home Assistant module 0.3.5"
git push origin main
git push origin v0.3.5
```

Required repository secrets for automatic Marketplace publishing:

- `LAVRONOS_MARKETPLACE_URL`
- `LAVRONOS_MARKETPLACE_USER`
- `LAVRONOS_MARKETPLACE_APPLICATION_PASSWORD`
