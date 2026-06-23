# Mineradio Security Rebuild Log - 2026-06-24

## Context

- The user ran a full Huorong scan and quarantined many infected files.
- Old installers and old packaged builds are not trusted anymore.
- `v1.1.0` is a source-first security rebuild checkpoint. Do not upload a new installer until a later clean release pass.

## Current Source Boundary

- Active source repository: `E:\桌面\播放器软件\Mineradio\resources\app`
- Current code version: `1.1.0`
- Generated `dist/` output was moved out of the active source tree.
- `.playwright-cli/`, `output/`, and `tmp/` are ignored and must not be pushed.
- Git-tracked executable/script residue check returned 0 tracked `.exe/.dll/.scr/.bat/.cmd/.ps1/.vbs/.jse/.wsf/.hta/.xlsm` files.

## Scan Notes

- Defender signature update completed before verification.
- Defender scan of current source via an English junction returned: `found no threats`.
- Huorong detections shown by the user were concentrated in `E:\桌面\播放器软件\工作区备份\2026-06-18-workspace-cleanup`, mostly old `node_modules`, old builder caches, and old packaged backup files.
- Those old backup files must not be used as restore sources.

## Update Fix Boundary

- Software update failures should stop in a clear error state.
- Fast patch failure must not automatically start a full installer download.
- Full installer download completion must not automatically open the installer.
- A verified already-downloaded installer may be reused to avoid repeat downloads.

## Before Any Future Installer Release

- Build from current Git-tracked source only.
- Do not reuse old `dist/`, old installers, old `node_modules`, or old backup packages.
- Run syntax checks and security scan on the new build output.
- Prefer code signing before public installer upload.
