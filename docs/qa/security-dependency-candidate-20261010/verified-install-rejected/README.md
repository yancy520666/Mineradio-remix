# Completed isolated verification: rejected candidate

The scoped `@electron/get@3.1.0 -> global-agent@4.1.3` candidate installed cleanly
but failed the explicit HTTPS custom-CA contract. The application manifests and
lockfile were not changed. Do not apply `rejected-candidate.patch` as a repair.

## Evidence

- `install.log.gz`: successful official-registry install, lifecycle scripts disabled.
- `npm-ls-selected.log.gz` and `npm-ls-all.json`: selected and complete installed
  dependency graphs; `npm ls --all --json` exited 0.
- `audit-installed.json`: candidate installed-tree audit, three high entries.
- `audit-current-baseline-lock.json`: unchanged application lock audit, 11 entries.
- `verification-summary.json`: versions, exact manifest/lock digests, scoped delta,
  contract outcomes and acceptance decision.
- `contract-*.log`: original HTTP/TLS/download contracts. The candidate trusted
  TLS request fails; the baseline trusted TLS request passes.
- `extended-*.log`: actual get HTTPS download with explicit CA, untrusted cert,
  CONNECT refusal and checksum-negative results. The candidate CA download fails
  while the same baseline download passes.
- `global-agent-current-metadata.json`: official latest version is 4.1.3.

All network fixture traffic is loopback-only. TLS verification remains enabled.
The fixture private key is synthetic and generated locally; it is not committed.
No Electron installation/download, application login test or real credential was
used. Linux Node 24.19.0 / npm 11.9.0 were used; these are not Windows build results.

## Reproduce the contracts

Use a separate disposable directory with a complete candidate or baseline
node_modules tree. Do not reuse an interrupted installation. Copy both fixture
scripts into that directory, then generate the throwaway localhost test identity
beside them using an existing OpenSSL installation:

```sh
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout fixture-key.pem -out fixture-cert.pem -days 1 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1

node proxy-contract.cjs /absolute/path/to/node_modules http
node proxy-contract.cjs /absolute/path/to/node_modules tls
node proxy-contract.cjs /absolute/path/to/node_modules download
node proxy-extended-contract.cjs /absolute/path/to/node_modules tls-untrusted
node proxy-extended-contract.cjs /absolute/path/to/node_modules get-https-ca
node proxy-extended-contract.cjs /absolute/path/to/node_modules checksum-mismatch
# Additional 4.1.3 error-response contract:
node proxy-extended-contract.cjs /absolute/path/to/node_modules connect-refused
```

For 4.1.3, `tls` and `get-https-ca` exit 1 with
`DEPTH_ZERO_SELF_SIGNED_CERT`; the others exit 0. For 3.0.0, the trusted TLS
and get HTTPS CA contracts exit 0. The fixture's logging records that `ca`
was supplied and `secureEndpoint` absent; it does not modify dependency code or
inject that field. The bad-checksum contract expects rejection and no cached file.

The original baseline TLS fixture reports Node's IP-SNI deprecation. The extended
HTTPS fixture uses localhost and avoids that warning; the regression is the same.

The two .log.gz files preserve original log bytes, including whitespace.
