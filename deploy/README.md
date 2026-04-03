# OCI build, SBOM, signing (MOL-51, MOL-59)

## What ships

- **GitHub Actions** [`.github/workflows/oci-release.yml`](../.github/workflows/oci-release.yml): on `v*.*.*` tags, builds `api` and `web` images, pushes semver tags to GHCR (or optional registry), generates **CycloneDX JSON** and **SPDX JSON** SBOMs (Syft via `anchore/sbom-action`), **attaches** those SBOMs to the same image digest in the registry with **cosign attest** (so `cosign download attestation` works), uploads matching files to the **GitHub Release** for offline download, and **signs** image manifests with **cosign sign** (keyless OIDC on GitHub-hosted runners).
- **Docker Compose** [`docker-compose.customer.yml`](../docker-compose.customer.yml): customer-facing pull/run contract using the same image names CI publishes.
- **Helm stub** [`helm/mola-runtime`](helm/mola-runtime): documents the same `imageRegistry` + repository names; extend with real templates when Milestone 3 picks Helm for delivery.

**Chemistry / execution runtime:** versioned customer **execution** images (reference runtime from MOLA-Python) are built and SBOM’d in that repository’s CI; use the same semver tag policy and registry promotion pattern there so pulls can pin `image@digest` with matching signatures and attestations. This repo owns the **business stack** images (`mola-business-api`, `mola-business-web`).

## Operator checklist

1. **Repository**: workflow sets `permissions` to `contents: write` (SBOM files attached to the GitHub Release), `packages: write`, and `id-token: write` (cosign). If you tighten org defaults, keep those scopes for this workflow.
2. **Tag a release**: `git tag v1.2.3 && git push origin v1.2.3` (pre-release: `v1.2.3-rc.1` matches the workflow pattern).
3. **Optional private registry**: set repo/org secrets `REGISTRY_URI`, `REGISTRY_USER`, `REGISTRY_PASSWORD`; workflow comments describe behavior.
4. **Verify signature** (example): `cosign verify ghcr.io/<owner>/mola-business-api@<digest>`.
5. **SBOMs**: download from the GitHub Release for the tag, or from workflow artifacts `sbom-api-<version>` / `sbom-web-<version>`. From the registry, verify and inspect SPDX attestations (example): `cosign verify-attestation --type=spdxjson ghcr.io/<owner>/mola-business-api@<digest>` (use `cyclonedx` for the CycloneDX attestation).

Replace placeholder Dockerfiles under `deploy/docker/` with production API and frontend builds when application code lands in this repository.
