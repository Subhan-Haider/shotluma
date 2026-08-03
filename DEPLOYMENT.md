# Editor deployment

This public repository owns the editor deployed at
`https://app.shotluma.com`. The marketing site at `https://shotluma.com` is
maintained and deployed from a separate private repository.

## Deploy

```bash
bun install --frozen-lockfile
bun run check
bun run deploy
```

The Cloudflare custom domain is source-controlled in `wrangler.jsonc`. Do not
attach this Worker to the apex domain, and do not add marketing-site source,
styles, assets, or production-only configuration to this repository.
