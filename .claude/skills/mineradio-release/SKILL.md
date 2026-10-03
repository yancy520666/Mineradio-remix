---
name: mineradio-release
description: Prepare and validate a Mineradio Remix release — bump the version everywhere, write the user-facing notes with 更新重点, run the GitHub release workflow (real install/upgrade/uninstall on a clean Windows runner), verify the draft's checksums and title, then update the README after the maintainer publishes. Use only when the maintainer asks to release or to prepare a draft.
---

# Mineradio Remix release

The maintainer publishes; you prepare and verify a **draft**. `RELEASE.md` has the background. Ask before pushing, before deleting an existing draft, and never edit a published Release without explicit consent.

## 0. Preconditions

- Working tree clean; `npm test`, `npm run check`, `npm run test:electron` pass locally (if `playlist-interaction` fails, rerun it alone; see CLAUDE.md).
- Mention the open licensing item (`qishui-audio-decryptor/`, `qishui-auth-v6/`) — the maintainer decides; do not claim compliance.
- Agree the version number with the maintainer (feature release → minor, fixes only → patch).

## 1. Version bump (all must match)

- `package.json` `version`
- `package-lock.json` top-level `version` **and** `packages[""].version`
- `public/index.html` `#update-modal-version` text
- `RELEASE.md` (current version, tag, asset and notes file names)
- `.github/workflows/release-windows.yml`: tag example, and the **upgrade baseline** = the previous public release (`$baseline`, `gh release download/view vX.Y.Z`) so the check is the upgrade users actually take

## 2. Notes

- Create `docs/RELEASE_NOTES_v<ver>.md` from the last section of `docs/RELEASE_NOTES_NEXT.md`. It becomes the Release body: no relative links, plain user language.
- Start with `## 更新重点` — 3–4 items, each `- **短语**：说明`. The in-app update dialog shows only those bold phrases.
- Then grouped sections (播放 / 界面 / 账号 / 本地曲库 / 性能 / 网络与安全), an install/upgrade paragraph, known notes.
- README: badge, “下载与安装”, move “下个版本（开发中）” items into a “<ver> 更新内容” section.
- Commit, then (with consent) push.

## 3. Build, validate, draft

```bash
gh workflow run release-windows.yml --repo yancy520666/Mineradio-remix \
  -f tag=v<ver> -f ref=$(git rev-parse HEAD) -f prepare_draft=true
gh run watch <run-id> --repo yancy520666/Mineradio-remix --exit-status --interval 60   # run in background
```

The publish job runs only if tests, build and the real install → upgrade → restart → uninstall check pass. On failure read `gh run view <id> --log-failed`; the installer check prints `UNINSTALL_LEFTOVER*` lines. Fix the cause, then rerun. If a stale draft for the same tag exists, ask, then `gh release delete v<ver> --yes` before rerunning (otherwise two drafts appear).

## 4. Verify the draft

- `gh release view v<ver> --json isDraft,targetCommitish,assets` — target must equal the validated commit.
- Download assets to a temp dir; `sha256sum -c SHA256SUMS.txt` (strip CR/BOM); `latest.yml` `version:` matches.
- Set the title: `gh release edit v<ver> --title "Mineradio Remix v<ver>" --draft=true`.
- Tell the maintainer: install the draft's setup over the previous version, check the listed changes, then click Publish.

## 5. After the maintainer publishes

- Never rerun the workflow for that tag from a later `main` (it would ship unreleased work). Later fixes get a new version.
- README: current version in download section; RELEASE_NOTES_NEXT gets a fresh “<ver> 之后的改动” section.
- Update `docs/AI_REVIEW_HANDOFF.md` version table.
