#!/usr/bin/env bash
# Stage derived/md into ./docs for MkDocs (docs_dir cannot be repo root).
# Mirrors nix-docs meta/prepare-docs-dir.sh: symlink vault → docs/, shallow nav.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
docs="$root/docs"
md_root="$root/derived/md"

if [[ ! -d "$md_root" ]]; then
  echo "Missing $md_root — run: node scripts/export-md.js --all" >&2
  exit 1
fi

translations=()
while IFS= read -r -d '' d; do
  id="$(basename "$d")"
  [[ -f "$d/README.md" ]] || continue
  translations+=("$id")
done < <(find "$md_root" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)

if [[ ${#translations[@]} -eq 0 ]]; then
  echo "No translation trees with README.md under $md_root — run export-md first" >&2
  exit 1
fi

rm -rf "$docs"
mkdir -p "$docs"

for id in "${translations[@]}"; do
  ln -s "$md_root/$id" "$docs/$id"
done

# Home page
{
  cat <<'EOF'
---
title: uberBible
---

# uberBible

Public-domain Protestant Christian Bibles as chapter Markdown.

Source of truth is [`derived/jsonl/`](https://github.com/zemdregon/uberBible/tree/main/derived/jsonl);
this site is generated from [`derived/md/`](https://github.com/zemdregon/uberBible/tree/main/derived/md)
(exported locally / in CI — large trees are not committed).

## Translations

EOF
  for id in "${translations[@]}"; do
    title="$id"
    if [[ -f "$md_root/$id/README.md" ]]; then
      name_line="$(grep -m1 '^translation_name:' "$md_root/$id/README.md" || true)"
      if [[ -n "$name_line" ]]; then
        title="${name_line#translation_name: }"
        title="${title# }"
        title="${title#\"}"
        title="${title%\"}"
      fi
    fi
    echo "- [$title]($id/README.md) (\`$id\`)"
  done
  cat <<'EOF'

## How this site is built

Same model as [nix-docs](https://github.com/zemdregon/nix-docs): Markdown vault → stage `docs/` → MkDocs Material → GitHub Pages.
EOF
} > "$docs/README.md"

# Generate mkdocs.yml = base + shallow nav (translation indexes only)
node "$root/scripts/generate-mkdocs-config.js"

echo "Prepared $docs (${#translations[@]} translations)"
