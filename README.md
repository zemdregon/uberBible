# uberBible

English public-domain Protestant Christian Bibles plus original-language texts (Hebrew OT, Greek NT/LXX, Coptic).

Non-English modern translations are not included. Catholic editions (Douay-Rheims, Vulgate, WEB Catholic, Petrus Canisius) and Jewish-specific translations (JPS, Leeser, Targum Onkelos) are excluded.

## Layout

| Path | Role |
|------|------|
| [`source/`](source/) | Raw downloads (immutable archive). Prefer USFM under `source/ebible/*/usfm/`. |
| [`derived/`](derived/) | **Processed exports, keyed by format** |
| [`derived/jsonl/`](derived/jsonl/) | Verse-level JSONL (normalize step). |
| [`derived/md/`](derived/md/) | Chapter Markdown trees (`{id}/{Book}/{NN}.md`). Generate locally; gitignored (large). |
| [`derived/manifest.json`](derived/manifest.json) | What was built for each format. |
| [`scripts/`](scripts/) | Normalize, MD export, site staging, optional vector ingest. |
| [`mkdocs.base.yml`](mkdocs.base.yml) | MkDocs Material config (nav generated at stage time). |

Embeddings / Qdrant are **one consumer** of `derived/jsonl/`. The project goal is a reusable multi-format corpus.

**Site:** [zemdregon.github.io/uberBible](https://zemdregon.github.io/uberBible/)

```
source/ebible/.../usfm  →  scripts/normalize-usfm.js  →  derived/jsonl/*.jsonl
derived/jsonl           →  scripts/export-md.js       →  derived/md/{id}/{Book}/{NN}.md
derived/md              →  scripts/prepare-docs-dir.sh → docs/ + mkdocs.yml → site/ (Pages)
derived/jsonl           →  scripts/ingest-qdrant.js   →  local Ollama + Qdrant  (optional)
```

## Normalize (USFM → JSONL)

```bash
# Sample set
node scripts/normalize-usfm.js --id eng-kjv2006 --id hboWLC --id grctr

# Everything with USFM
node scripts/normalize-usfm.js --all
```

Each line in `derived/jsonl/{id}.jsonl`:

```json
{
  "id": "eng-kjv2006:Gen.1.1",
  "text": "In the beginning God created the heaven and the earth.",
  "text_for_embed": "Genesis 1:1 — In the beginning God created the heaven and the earth.",
  "tags": ["ot", "pentateuch", "public-domain"],
  "meta": {
    "translation_id": "eng-kjv2006",
    "book_osis": "Gen",
    "chapter": 1,
    "verse": 1,
    "strongs": ["H7225", "H0430"]
  }
}
```

## Export Markdown (one file per chapter)

Reads JSONL (not USFM) and writes:

```
derived/md/{translation_id}/
  README.md          # book/chapter index
  Gen/01.md
  Matt/01.md
  ...
```

```bash
node scripts/export-md.js --id eng-kjv2006 --id hboWLC --id grctr
# or: npm run export:md -- --id eng-kjv2006
# full corpus (~120k files): node scripts/export-md.js --all
```

Chapter files use YAML frontmatter plus `**verse** text` paragraphs. Each book also gets a `README.md` index. The MD tree is gitignored; regenerate locally when needed.

## GitHub Pages (MkDocs Material)

Same pipeline as nix-docs: stage Markdown into gitignored `docs/` → `mkdocs build` → deploy `site/`.

```bash
node scripts/export-md.js --all          # or a subset of --id …
bash scripts/prepare-docs-dir.sh         # symlinks derived/md → docs/, writes mkdocs.yml
pip install -r requirements-docs.txt
mkdocs serve                             # http://127.0.0.1:8000
# mkdocs build                           # → ./site
```

CI: [`.github/workflows/pages.yml`](.github/workflows/pages.yml) exports all JSONL→MD, stages, builds, and deploys on push to `main`.

Global nav lists **translation indexes only**; chapters are reached via Contents links and search (`omitted_files: ignore`).

## Optional: local embeddings → Qdrant

Requires [Ollama](https://ollama.com) with `nomic-embed-text`, and a local [Qdrant](https://qdrant.tech) on `:6333`. No OpenAI.

```bash
ollama pull nomic-embed-text

# Qdrant (Docker), or on NixOS e.g.:
#   cd .qdrant && steam-run /path/to/qdrant
docker run -d -p 6333:6333 -p 6334:6334 --name qdrant qdrant/qdrant

node scripts/ingest-qdrant.js --id eng-kjv2006
# node scripts/ingest-qdrant.js --all   # large; embeds every verse locally
```

Env overrides: `OLLAMA_HOST`, `OLLAMA_EMBED_MODEL`, `QDRANT_URL`, `QDRANT_COLLECTION`, `INGEST_BATCH`, `INGEST_CONCURRENCY`.

## Source notes

See [`source/_meta/INDEX.txt`](source/_meta/INDEX.txt) for the full translation list.
