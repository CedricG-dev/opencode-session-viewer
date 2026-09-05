# Publishing to npm

## Versioning & Tagging

1. Update `package.json` version or let workflow auto-set from tag
2. Create annotated tag: `git tag -a v1.0.0 -m "Release v1.0.0"`
3. Push tag: `git push origin v1.0.0`

## Workflow

- Triggers on `v*` tags pushed to main branch
- Runs security scans (npm audit + Trivy)
- Automatically sets npm version from tag name
- Publishes to npmjs.com under `@cedricg-dev` scope via [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers) — no npm token involved

## Requirements

- Tag must point to a commit on the `main` branch
- `package.json` must have `"private": false`
- A trusted publisher configured on npmjs.com for this package, pointing at this repo and the `publish.yml` workflow filename (Package Settings → Trusted Publisher)

## Security

All commits to `main` and pull requests are automatically scanned for vulnerabilities using:
- **npm audit**: Checks npm dependencies for known vulnerabilities
- **Trivy**: Scans filesystem for OS and library vulnerabilities

Tags are scanned again before publishing as an additional safety check.
