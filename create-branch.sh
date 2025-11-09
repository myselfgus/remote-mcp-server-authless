#!/bin/bash
# Script to create a new branch from commit 45ef83cb023b6f0aa541cac9f607a3d2f3d325b5

set -e

COMMIT="45ef83cb023b6f0aa541cac9f607a3d2f3d325b5"
BRANCH_NAME="new-branch-from-45ef83c"

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
