#!/usr/bin/env bash
# Stage derived/md (+ derived/study/md) into ./docs for MkDocs.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
docs="$root/docs"
md_root="$root/derived/md"
study_md="$root/derived/study/md"

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

study_works=()
if [[ -d "$study_md" ]]; then
  while IFS= read -r -d '' d; do
    id="$(basename "$d")"
    [[ -f "$d/README.md" ]] || continue
    study_works+=("$id")
  done < <(find "$study_md" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
fi

rm -rf "$docs"
mkdir -p "$docs"

for id in "${translations[@]}"; do
  ln -s "$md_root/$id" "$docs/$id"
done

if [[ ${#study_works[@]} -gt 0 ]]; then
  mkdir -p "$docs/study"
  for id in "${study_works[@]}"; do
    ln -s "$study_md/$id" "$docs/study/$id"
  done
fi

# Home page
{
  cat <<'EOF'
---
title: uberBible
---

# uberBible

English public-domain Protestant Christian Bibles and original-language texts as chapter Markdown, plus a separate study-materials corpus (concordances, dictionaries, cross-references, commentaries, gazetteers).

Verse source of truth: [`derived/jsonl/`](https://github.com/zemdregon/uberBible/tree/main/derived/jsonl).
Study source of truth: [`derived/study/jsonl/`](https://github.com/zemdregon/uberBible/tree/main/derived/study/jsonl).
This site is generated from Markdown exports (large trees are not committed).

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

  if [[ ${#study_works[@]} -gt 0 ]]; then
    cat <<'EOF'

## Study materials

EOF
    for id in "${study_works[@]}"; do
      title="$id"
      if [[ -f "$study_md/$id/README.md" ]]; then
        name_line="$(grep -m1 '^work_title:' "$study_md/$id/README.md" || true)"
        if [[ -n "$name_line" ]]; then
          title="${name_line#work_title: }"
          title="${title# }"
          title="${title#\"}"
          title="${title%\"}"
        fi
      fi
      echo "- [$title](study/$id/README.md) (\`$id\`)"
    done
  fi

  cat <<'EOF'

## How this site is built

Same model as [nix-docs](https://github.com/zemdregon/nix-docs): Markdown vault → stage `docs/` → MkDocs Material → GitHub Pages.
EOF
} > "$docs/README.md"

# Generate mkdocs.yml = base + shallow nav
node "$root/scripts/generate-mkdocs-config.js"

echo "Prepared $docs (${#translations[@]} translations, ${#study_works[@]} study works)"
