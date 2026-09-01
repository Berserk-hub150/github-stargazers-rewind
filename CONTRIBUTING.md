# Contributing

Contributions should be small, testable, and focused on improving reconstruction quality, compatibility, performance, or clarity.

## Local setup

1. Clone the repository.
2. Run `node scripts/validate.mjs`.
3. Load `extension/` as an unpacked extension from `chrome://extensions/`.
4. Test against public GitHub repository `/stargazers` pages.

## Pull requests

- Explain the user-visible problem being solved.
- Keep unrelated refactors out of the same pull request.
- Preserve the distinction between historical reconstruction and live membership.
- Do not introduce requirements for users to provide GitHub tokens unless there is a strong, documented reason.
- Run the validation script before opening a pull request.

## Good contribution areas

- resilient parsing of GitHub page changes;
- clearer archive-source diagnostics;
- better accessibility and keyboard navigation;
- tests for merge/deduplication behavior;
- performance improvements for large reconstructed lists;
- documentation improvements.
