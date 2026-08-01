# uberBible

Public-domain Protestant Christian Bibles plus original-language texts (Hebrew OT, Greek NT/LXX, Coptic).

Catholic editions (Douay-Rheims, Vulgate, WEB Catholic, Petrus Canisius) and Jewish-specific translations (JPS, Leeser, Targum Onkelos) are excluded.

## Layout

| Path | Role |
|------|------|
| [`source/`](source/) | Raw downloads (immutable archive). Prefer USFM under `source/ebible/*/usfm/`. |
| [`derived/`](derived/) | **Processed exports, keyed by format** — not only JSON, not only embeddings. |
| [`derived/jsonl/`](derived/jsonl/) | Verse-level JSONL (normalize step). |
| [`derived/md/`](derived/md/) | Reserved for Markdown (and similar) exports. |
| [`derived/manifest.json`](derived/manifest.json) | What was built for each format. |
| [`scripts/`](scripts/) | Normalize, optional vector ingest, future exporters. |

Embeddings / Qdrant are **one consumer** of `derived/jsonl/`. The project goal is a reusable multi-format corpus.

```
source/ebible/.../usfm  →  scripts/normalize-usfm.js  →  derived/jsonl/*.jsonl
                                                      →  derived/md/   (later)
derived/jsonl  →  scripts/ingest-qdrant.js  →  local Ollama + Qdrant  (optional)
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
