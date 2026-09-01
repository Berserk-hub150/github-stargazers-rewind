# Changelog

All notable changes to this project are documented here.

## 0.4.0 - 2026-09-01

### Added

- Immutable GitHub repository ID (`repo_id`) lookup to retain historical coverage across renames and transfers.
- Current repository-name lookup as a fallback.
- Multi-table public ClickHouse archive querying.
- Recent public GitHub repository event merging.
- Case-insensitive identity deduplication.
- Separate reporting for GitHub's live star count and reconstructed historical identities.

### Changed

- Removed the previous artificial 25,000-user result cap.
- Rebranded the extension as **GitHub Stargazers Rewind**.
- Expanded project documentation, contribution guidance, security guidance, and automated validation.

### Known limitation

Public `WatchEvent` history records star additions but does not reliably expose the inverse event for later unstars. The reconstructed list is therefore historical and best-effort rather than an exact live membership list.
