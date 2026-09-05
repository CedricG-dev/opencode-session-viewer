# Publishing to npm

## Versioning & Tagging

1. Update `package.json` version or let workflow auto-set from tag
2. Create annotated tag: `git tag -a v1.0.0 -m "Release v1.0.0"`
3. Push tag: `git push origin v1.0.0`

## Workflow

- Triggers on `v*` tags pushed to main branch
- Runs security scans (npm audit + Trivy)
- Automatically sets npm version from tag name
- Submits the release to npm's [staged publishing](https://docs.npmjs.com/staged-publishing) area via [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers) — no npm token involved

## Approving a release

The workflow only stages the package — it does not go live automatically. After a tag push succeeds:

1. Go to the package's **Staged Packages** tab on npmjs.com (or run `npm stage list @cedricg-dev/opencode-session-viewer`).
2. Review the staged version.
3. Approve it with 2FA: click **Approve** on npmjs.com, or run `npm stage approve <stage-id>` locally.

The version isn't published to the registry until this manual approval step is done.

## Requirements

- Tag must point to a commit on the `main` branch
- `package.json` must have `"private": false`
- A trusted publisher configured on npmjs.com for this package, pointing at this repo and the `publish.yml` workflow filename (Package Settings → Trusted Publisher)

## Security

All commits to `main` and pull requests are automatically scanned for vulnerabilities using:
- **npm audit**: Checks npm dependencies for known vulnerabilities
- **Trivy**: Scans filesystem for OS and library vulnerabilities

Tags are scanned again before publishing as an additional safety check.
