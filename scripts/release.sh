#!/bin/bash
# release.sh - trigger the two-phase release workflow on GitHub.
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}$1${NC}"; }
warn()  { echo -e "${YELLOW}$1${NC}"; }
error() { echo -e "${RED}$1${NC}"; }
step()  { echo -e "${BLUE}$1${NC}"; }

command -v gh >/dev/null || { error "GitHub CLI (gh) is not installed."; exit 1; }
gh auth status >/dev/null 2>&1 || { error "Not authenticated with GitHub CLI. Run: gh auth login"; exit 1; }

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    warn "Warning: you are not on main (current: $CURRENT_BRANCH)"
    read -p "Continue anyway? (y/N) " -n 1 -r; echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

[ -z "$(git status --porcelain)" ] || { error "Working directory is not clean. Commit or stash first."; exit 1; }

step "Pulling latest changes from origin..."
git pull origin "$CURRENT_BRANCH"
[ -z "$(git status --porcelain)" ] || { error "Working directory not clean after pull."; exit 1; }

step "Analyzing commits to determine next version..."
SUGGESTED_VERSION=$(bun scripts/calculate-next-version.ts 2>/dev/null || echo "0.0.1")
info "Version analysis:"
bun scripts/calculate-next-version.ts --verbose 2>/dev/null | sed 's/^/  /'

echo
read -p "Version [$SUGGESTED_VERSION]: " VERSION
VERSION="${VERSION:-$SUGGESTED_VERSION}"
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { error "Invalid version format. Use SemVer (e.g., 1.0.0)"; exit 1; }

git rev-parse "$VERSION" >/dev/null 2>&1 && { error "Tag '$VERSION' already exists locally"; exit 1; }
git ls-remote --tags origin | grep -q "refs/tags/$VERSION$" && { error "Tag '$VERSION' already exists on remote"; exit 1; }

echo
info "Release will be created with version: $VERSION"
warn "The GitHub workflow will:"
warn "  1. Bump package.json and generate CHANGELOG.md"
warn "  2. Commit and tag the release commit"
warn "  3. Re-dispatch itself at the tag to build binaries for all targets"
warn "  4. Attest and create the GitHub release"
echo
read -p "Trigger release workflow on GitHub? (Y/n) " -n 1 -r; echo
[[ $REPLY =~ ^[Nn]$ ]] && { warn "Release cancelled"; exit 1; }

step "Pushing to origin..."
git push origin "$CURRENT_BRANCH"

step "Triggering release workflow..."
gh workflow run release.yml --ref "$CURRENT_BRANCH" -f "version=$VERSION"
info "Done. Watch it with: gh run watch"
