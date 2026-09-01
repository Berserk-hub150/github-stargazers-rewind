# Architecture

GitHub Stargazers Rewind is a Manifest V3 browser extension with three main responsibilities: detect when the normal GitHub stargazer list cannot be used, reconstruct a best-effort public history, and render that history inside GitHub.

## Components

### `extension/content.js`

Runs on GitHub repository `/stargazers` URLs. It:

1. extracts the owner and repository from the current URL;
2. checks whether GitHub already exposes a usable stargazer list;
3. requests a reconstruction from the extension service worker when needed;
4. renders loading, error, search, pagination, counts, and reconstructed user rows;
5. caches completed snapshots in `chrome.storage.local` for a short period.

### `extension/background.js`

Acts as the reconstruction engine. It:

1. fetches current repository metadata from GitHub;
2. obtains the immutable numeric `repo_id` when available;
3. queries public ClickHouse GitHub-event tables using both `repo_id` and the current repository name;
4. fetches recent public repository events from GitHub;
5. merges and deduplicates identities;
6. returns a normalized snapshot to the content script.

### Popup

`popup.html`, `popup.js`, and `popup.css` provide a small extension-level entry point and status surface.

## Data model

A reconstructed user may contain:

- `login`: GitHub username;
- `starredAt`: latest public timestamp observed for a matching `WatchEvent`;
- `avatarUrl`: avatar URL when available from recent GitHub events;
- `source` / `sources`: provenance used to explain where the identity came from.

A completed snapshot also records repository metadata, the current GitHub star count when available, archive source information, recent-event coverage, and reconstruction time.

## Why `repo_id` matters

Repository names are mutable. Owners can rename repositories and repositories can be transferred. Historical events may therefore contain an older `owner/repo` string. GitHub's numeric repository ID is stable across those operations, so querying by ID recovers history that a current-name-only search can miss.

The extension still queries the current name because some archive tables or event eras can have incomplete numeric IDs.

## Accuracy model

The reconstruction deliberately distinguishes between:

- **current star count**: the number GitHub reports now; and
- **reconstructed identities**: usernames observed in public historical and recent event sources.

These values answer different questions and should not be treated as interchangeable.

## Trust boundaries

The extension sends requests only to hosts declared in `manifest.json`:

- `github.com`;
- `api.github.com`;
- `play.clickhouse.com`.

No GitHub personal access token is required by the extension.
