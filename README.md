# GitHub Stargazers Rewind

A Chrome/Chromium extension that reconstructs the broadest publicly available history of GitHub stargazers when the normal `/stargazers` page is unavailable or incomplete.

It combines public GitHub `WatchEvent` data from ClickHouse archives with recent repository events, deduplicates users, and uses GitHub's immutable numeric repository ID to survive repository renames and transfers.

> [!IMPORTANT]
> This is a **historical reconstruction**, not a proof of the repository's exact current stargazer membership. Public `WatchEvent` data records stars being added, but does not provide a reliable inverse event for every later unstar.

## Features

- Reconstructs historical stargazer identities from public `WatchEvent` archives.
- Uses immutable `repo_id` plus the current `owner/repo` name as a fallback.
- Queries multiple public ClickHouse GitHub-event tables when available.
- Merges recent public repository events.
- Deduplicates usernames case-insensitively.
- Keeps GitHub's live star count separate from reconstructed historical identities.
- Adds search and pagination directly to the reconstructed stargazer view.
- Uses local extension storage for short-lived caching.
- Requires no GitHub token.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions/` in Chrome, Chromium, Brave, Edge, or another Chromium-based browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `extension/` directory.
6. Open a GitHub URL ending in `/stargazers` and reload the page.

## How it works

```text
GitHub /stargazers page
        |
        v
content.js detects a missing/inaccessible list
        |
        v
background.js
   |               |
   |               +--> GitHub REST API: repository metadata + recent events
   |
   +------------------> public ClickHouse GitHub WatchEvent archives
        |
        v
merge + deduplicate + sort
        |
        v
reconstructed stargazer UI
```

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Accuracy and limitations

GitHub's public event history is useful but not equivalent to the current stargazer list.

- A reconstructed user may have unstarred later.
- Some old events may be missing from public archives.
- Repository renames/transfers are handled more robustly through `repo_id`, but archive coverage can still vary.
- If reconstructed identities are fewer than GitHub's current star count, some historical identities are missing from the archive.
- If reconstructed identities exceed the current star count, some users may have unstarred.
- Even if both counts are equal, that does not prove the identities are exactly the same.

The extension exposes both numbers deliberately instead of pretending the reconstruction is exact.

## Privacy

The extension does not ask for a GitHub token. It accesses only:

- public GitHub repository metadata and repository events;
- public GitHub-event archives exposed through ClickHouse;
- local browser storage for cached reconstruction results.

Review the permissions in [`extension/manifest.json`](extension/manifest.json) before installing.

## Development

Run the repository validation script with Node.js:

```bash
node scripts/validate.mjs
```

The same validation runs in GitHub Actions on pushes and pull requests.

## Repository structure

```text
extension/
  background.js   data collection and reconstruction
  content.js      GitHub page integration and rendering
  content.css     injected stargazer UI styles
  popup.html      extension popup
  popup.js        popup behavior
  popup.css       popup styles
  manifest.json   Manifest V3 configuration
scripts/
  validate.mjs    lightweight repository validation
docs/
  ARCHITECTURE.md implementation notes
```

## Contributing

Bug reports and small focused improvements are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

Please read [`SECURITY.md`](SECURITY.md) before reporting a security-sensitive issue.

## License

MIT — see [`LICENSE`](LICENSE).
