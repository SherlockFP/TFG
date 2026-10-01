#!/usr/bin/env bash
# Retired2026-10-01. Shared-checkout integration and main publication belong to root.
# No automatic merge, conflict union, staging, commit, test or push occurs here.
set -eu
printf '%s\n' 'merge_agent.sh is retired. Follow docs/GAUNTLET.md; root reviews the shared diff, verifies it and publishes main.' >&2
exit 2
