#!/usr/bin/env bash
# Publish this project to the shared GitHub Pages repo (paper-rockets/Savanah) as its sandbox/ folder.
# Every other folder in that repo (the other projects) is kept exactly as it is on GitHub.
# The root menu page and README come from tools/pages-root/.
#
# Run from anywhere:  bash tools/publish.sh "what changed"
set -euo pipefail
cd "$(dirname "$0")/.."
MSG="${1:-Update sandbox}"
REMOTE=https://github.com/paper-rockets/Savanah.git

# save this folder's work as a local commit first
git add -A
git diff --cached --quiet || git commit -q -m "$MSG"

git fetch -q "$REMOTE" main
BASE=$(git rev-parse FETCH_HEAD)

# build the new GitHub tree in a spare index: GitHub's tree, with sandbox/ and the root menu swapped for ours
IDX=$(mktemp)
trap 'rm -f "$IDX"' EXIT
export GIT_INDEX_FILE="$IDX"
git read-tree "$BASE"
git rm -r -q --cached --ignore-unmatch sandbox index.html README.md .nojekyll
git read-tree --prefix=sandbox/ HEAD
for f in index.html README.md; do
  git update-index --add --cacheinfo "100644,$(git hash-object -w "tools/pages-root/$f"),$f"
done
git update-index --add --cacheinfo "100644,$(git hash-object -w --stdin </dev/null),.nojekyll"
TREE=$(git write-tree)
unset GIT_INDEX_FILE

if [ "$TREE" = "$(git rev-parse "$BASE^{tree}")" ]; then
  echo "GitHub is already up to date."
  exit 0
fi
COMMIT=$(printf '%s\n' "$MSG" | git commit-tree "$TREE" -p "$BASE")
git push -q "$REMOTE" "$COMMIT:refs/heads/main"
echo "Published. Live in a minute or two: https://paper-rockets.github.io/Savanah/sandbox/"
