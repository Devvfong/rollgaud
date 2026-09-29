# Security Model and Findings

**Status:** Local controls and audit evidence recorded; public-push gate remains pending until a maintainer reviews this commit and configures the external GitHub protections.

| Threat | Intended control | Evidence status |
| --- | --- | --- |
| Forged CI submission | Scoped token **plus** GitHub successful-run and manifest verification | Local tests pass; live GitHub run pending |
| Secret committed | Gitleaks CI gate; protected environment secrets | Manual redacted review pass; Gitleaks unavailable locally |
| Vulnerable image | Trivy policy: block reviewed `CRITICAL` with available fix | Workflow/static checks pass; live registry scan pending |
| Public API compromise to Docker | Separate host worker; no API Docker socket | Host/config checks pass |
| Arbitrary image/host command | Namespace/digest allowlist; fixed templates; no shell interpolation | Local worker tests pass |
| Unauthorized rollback | Admin session, CSRF and per-project active attempt lock | Local API/worker tests pass |
| Exposed telemetry/DB | Internal networks and no public ports | Host/observability checks pass |
| Sensitive logs | Redaction; no secrets in deployment event metadata | Local checks pass; live log review pending |

Docker socket access grants broad host control, including when used by a dedicated worker account. The MVP limits who receives it; it does not claim sandboxed execution of arbitrary untrusted customer images. The single host is also a single point of failure.

## Finding log

| Finding ID | Source/run | Severity | Impact | Decision and owner | Verification |
| --- | --- | --- | --- | --- | --- |
| SEC-17-001 | Local history/tree/config audit | Info | `gitleaks` CLI is not installed in this environment, so the required scanner could not run | Keep publication blocked until the same redacted history and directory scans run with a current Gitleaks binary | Manual filename/count review recorded below; rerun Gitleaks before push |
| SEC-17-002 | Local refs and working tree | Info | No remote is configured; GitHub secret scanning/push protection cannot be enabled locally | Maintainer must enable both protections before first public push | Pending external setting |

For demo scans, use known fake secrets and a controlled, pre-verified vulnerable image on non-deployable branches. Never expose real secrets or deploy the vulnerable image to the public host.

## Mandatory pre-push publication gate

Before publishing any ref, inspect the staged diff, working tree, all local refs/reachable commits, CI configuration, Dockerfiles, generated frontend output, and runtime configuration. Run Gitleaks over history and current files with `--redact=100`; record no secret values. The candidate branch must not track `.env`, `.qodo/`, `documentation/`, archives, real credentials, private keys, credential-bearing URLs, private host details, or hardcoded secret fallbacks.

`.env.example` is documentation only and contains deliberately non-working placeholders. Required values are injected at runtime from protected environment/files or CI secret storage and must be rejected when absent or malformed. A Gitleaks/manual-review finding stops publication: revoke and rotate the affected value, remove it from all reachable history through an approved rewrite, rerun the full gate, and obtain explicit authorization before a force-push. Never include a discovered value in logs, tickets, reports, or command output.

### Latest local gate record

- Reviewed refs with `git show-ref`, then the complete reachable history with `git log --all` and `git rev-list --all` (19 commits): `abc4b31d4e94d9e7b09f8aea5456dc50390385db`, `16993e6960cf922f0e61b752b4fe7375ab09d3d8`, `653a6801a60ab604811ab0942dfe05f5f20080ba`, `49f473c79e4b4fd7bfd8cc1ffc50704f481a9d06`, `2f25f5662722cae86b48bf1b6836135348b26823`, `d47382e8c46d666c4473fa532fae1bd41d1f660e`, `4bfe8f7eafdf26b37ad42f89581e38f504b80fa7`, `c4001a0ab9077bbf42a2070c25b6fa33f30f5803`, `e5a8479d158d85f998922b02920b86c8fe96ee09`, `e5d1c560138019e2b8e478850c14f8ade1a7e635`, `23a02a086ada1f55f804d3ccbb0ca2ec3a5dea09`, `e9872533e8a7bfe4d5ffbe3fb6e53f0af6b6fb1b`, `afba90e71145820b1ead0467122a7b8448304146`, `cc6e1489ef5a3a755fb191d786611beb89417b10`, `2df66cdfe002598ce03900831c5463b4af22017b`, `da72dfef10d9e746d84471e2e732b18f0bc7ee5f`, `f30b30d2b99cddf86416511ad28d78640d01feb5`, `63f051c05da502a690bb85bb96a64cc4fa9ac722`, and `f6890a190c6a982b5e8b716109c488396677ea82`, plus the repository's internal capture/checkpoint refs. No remote exists and no push was attempted.
- `git status --short`, `git diff --check`, staged-diff review, tracked-path review, CI/Dockerfile/config review, and frontend-bundle filename/content review were run with redacted output. The only pre-existing unstaged product change is `apps/api/package.json`'s expanded test command; it is unrelated to Task 17 and remains unstaged for a separate deliberate commit.
- `gitleaks` was not installed (`command -v gitleaks` returned no path), so `gitleaks git --redact --log-opts="--all" .` and `gitleaks dir --redact .` could not be executed. This is a publication blocker, not a clean scan. Manual pattern scans reported filenames/counts only and printed no candidate secret values. No real credentials, private keys, credential-bearing URLs, private host details, or hardcoded secret fallbacks were found in the reviewed files.
- `.env.example` values remain non-working placeholders. `documentation/` is untracked and excluded from this commit; `.qodo/` and archives are excluded from Git. No generated frontend bundle containing server-only values was found in the reviewed build output.
- Publication status: **PENDING** until a current Gitleaks binary scan, external GitHub secret-scanning/push-protection settings, and the live G1–G7 gates are evidenced.
