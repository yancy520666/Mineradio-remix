# Candidate verification, not an applied repair

Do not change the production checkout until this candidate has passed review.
Keep the current checked-in dependency versions. Current isolated stage is
incomplete and must not be reused as a runtime.

## Optional manual verification of the candidate

Use a new empty scratch directory on the user's machine. Copy the supplied
candidate package.json and package-lock.json plus proxy-contract.cjs there.
The manifests are from `stage/`; the fixture script is one directory above it.
Do not copy the stage/node_modules directory. Use Node >=22.12 (the existing
Electron package minimum); this Linux fixture was authored with Node 24.19.

From the new directory:

    npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
    npm ls global-agent @electron/get roarr sprintf-js
    npm audit --package-lock-only --ignore-scripts --json --registry=https://registry.npmjs.org

Expected structure: app-builder-lib's @electron/get stays 3.1.0; its global-agent
is 4.1.3; roarr and sprintf-js absent. Expected audit from 2026-10-10: three high
package alerts, zero moderate/critical, with no claim of zero risk. Current
registry metadata may change. Save the full JSON instead of relying on counts.

For the synthetic TLS fixture, with an existing OpenSSL command available:

    openssl req -x509 -newkey rsa:2048 -nodes -keyout fixture-key.pem -out fixture-cert.pem -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1

This creates a throwaway local test identity; no account credentials are needed.
The fixture uses the explicit test CA for its positive test and rejects the same
untrusted certificate in its negative test. Never disable certificate validation.
The generated files must be beside proxy-contract.cjs.

PowerShell, from that directory:

    $modules = Join-Path (Get-Location) 'node_modules'
    node proxy-contract.cjs $modules http
    node proxy-contract.cjs $modules tls
    node proxy-contract.cjs $modules download

Each should exit zero with JSON passed:true for version 4.1.3. These tests exercise
only local HTTP proxy, NO_PROXY bypass, HTTPS CONNECT/CA trust/invalid-cert
rejection and a harmless get.downloadArtifact SHA256 download; they are not a
Windows installer build, desktop runtime launch or music-provider acceptance.
A Node IP-SNI deprecation can appear in the TLS fixture; it is not a TLS bypass.

Before integrating, independently review lock delta and test the actual Windows
installer download with the user's normal proxy/CA setup. This document does not
authorize publishing a release or claim that such a build already passed.

Persistent candidate manifests and patch are stored separately at
`/workspace/shared/mineradio-dependency-candidate-20261010/`.
Use those manifests, not the application's unchanged production package files.
