#!/bin/bash
# Script to create a new branch from commit 45ef83cb023b6f0aa541cac9f607a3d2f3d325b5

set -e

COMMIT="45ef83cb023b6f0aa541cac9f607a3d2f3d325b5"
BRANCH_NAME="new-branch-from-45ef83c"

# Verify that the commit exists
echo "Verifying commit ${COMMIT}..."
if ! git rev-parse --verify "${COMMIT}^{commit}" >/dev/null 2>&1; then
    echo "Error: Commit ${COMMIT} does not exist in this repository"
    exit 1
fi

# Check if branch already exists
if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
    echo "Warning: Branch ${BRANCH_NAME} already exists"
    echo "To recreate it, first delete the existing branch:"
    echo "  git branch -D ${BRANCH_NAME}"
    exit 1
fi

echo "Creating new branch ${BRANCH_NAME} from commit ${COMMIT}..."
git checkout -b "${BRANCH_NAME}" "${COMMIT}"

echo "Branch created successfully!"
echo "Current branch:"
git branch --show-current

echo ""
echo "Commit details:"
git log -1 --oneline

echo ""
echo "To push this branch to remote, run:"
echo "  git push -u origin ${BRANCH_NAME}"
