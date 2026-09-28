# DevDeploy Practicum Report

**Status:** Draft structure. Fill the results and discussion from actual implementation and measured tests, not the proposal.

## Abstract

DevDeploy proposes a one-host deployment controller for a Dockerized stateless web application. The completed abstract should state the implemented method, measured outcomes, and observed limits. **Results pending.**

## 1. Introduction and problem

Manual SSH deployments can lead to inconsistent steps, hard-to-trace releases and slow recovery. Define the target setting and why a self-hosted controller is useful for a small team. Compare a direct GitHub Actions-to-SSH workflow with DevDeploy's centralized release history, checks and recovery. State that a simple single-app team may reasonably use direct Actions instead.

## 2. Objectives, scope and requirements

Reference specification G1–G7, one Ubuntu host, one administrator, one stateless demo app. Exclude multi-tenant hosting, multi-host failover and database migration rollback. Add lecturer-approved scope changes with dates.

## 3. Related tools and selected approach

Explain what GitHub Actions, GHCR, Docker Compose, Traefik, Prometheus/Grafana and Loki/Alloy already do. Explain which logic DevDeploy itself implements: provenance check, deployment state, worker orchestration, route verification, rollback and dashboard. Cite official documentation and any academic sources required by the program.

## 4. System analysis and design

Add context/component diagrams, trust boundaries, domain model, database ERD, API table, state machine, UI page map and sample deployment sequence. Link `docs/architecture.md` and `docs/api.md`.

## 5. Implementation

Describe actual source layout, worker isolation, CI manifests, fixed Compose/route templates, frontend integration, observability and backup job. Include important code excerpts only when they explain a design decision.

## 6. Test method and results

Use `docs/test-report.md`. Include actual environment, commands, runs, screenshots, recovery time, HTTP response during failure, 20-deployment disk behavior, 1 RPS measurement, and isolated restore. Distinguish passes, failures and untested gates.

## 7. Security and operational evaluation

Use `docs/security.md`. Discuss Docker socket privilege, single-host availability, CI provenance, scanner findings and practical mitigations. Explain that image scanning does not prove an application has no vulnerabilities.

## 8. Limitations and future work

State actual unresolved findings, one-server failure mode, stateless-only rollback, GitHub/registry dependencies, and measured capacity. Possible future work: multi-host isolation, stronger artifact attestation, alerts and self-service onboarding.

## 9. Conclusion

Report whether each objective was met using evidence, without claiming production readiness beyond what was tested.

## References and appendices

Add official documentation and cited research; append configuration snapshots, workflow URLs, redacted logs, UI screenshots, database diagram, test matrix and restore transcript. Follow RUPP/lecturer formatting requirements when known.
