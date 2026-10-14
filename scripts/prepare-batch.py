"""Prepare a batch of PDFs for transcription.

Usage: python -I scripts/prepare-batch.py <batch-name> <count> [seed]

Renders "visual" PDFs (no extractable text) to PNG pages and points text PDFs at
their pdftotext output. Writes data/batches/<batch-name>/manifest.json and
skips documents already parsed (data/parsed/<id>.json) or already in a batch.
"""
import json
import os
import random
import sys

import pymupdf

pymupdf.TOOLS.mupdf_display_errors(False)

name, count = sys.argv[1], int(sys.argv[2])
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
# Optional: only documents whose championship slug starts with this prefix (e.g. "cuba-metropolitano").
prefix = sys.argv[4] if len(sys.argv) > 4 else ''

docs = json.load(open('data/docs.json', encoding='utf8'))
if prefix:
    docs = [d for d in docs if ((d.get('championships') or {}).get('slug') or '').startswith(prefix)]
used = set()
if os.path.isdir('data/batches'):
    for b in os.listdir('data/batches'):
        m = os.path.join('data/batches', b, 'manifest.json')
        if os.path.exists(m):
            used |= {x['id'] for x in json.load(open(m, encoding='utf8'))}
done = {f[:-5] for f in os.listdir('data/parsed')} if os.path.isdir('data/parsed') else set()


def kind(d):
    doc = pymupdf.open('data/files/' + d['storage_path'])
    text = ''.join(p.get_text() for p in doc)
    return ('text' if len(text.strip()) > 300 else 'visual'), len(doc)


random.Random(seed).shuffle(docs)
picked = []
want = {'text': count // 2, 'visual': count - count // 2}
if prefix:  # a targeted batch takes whatever the championship has, regardless of the text/visual mix
    want = {'text': count, 'visual': count}
got = {'text': 0, 'visual': 0}
for d in docs:
    if d['id'] in used or d['id'] in done:
        continue
    k, pages = kind(d)
    # Page cap only for image batches (each page is an image to read); text of long documents is cheap.
    if (k == 'visual' and pages > 3) or got[k] >= want[k]:
        continue
    got[k] += 1
    entry = {
        'id': d['id'],
        'title': d['title'],
        'class': (d.get('classes') or {}).get('name'),
        'championship': (d.get('championships') or {}).get('name'),
        'kind': k,
        'out': f"data/parsed/{d['id']}.json",
    }
    if k == 'text':
        entry['inputs'] = [f"data/txt/{d['id']}.txt"]
    else:
        os.makedirs('data/img', exist_ok=True)
        doc = pymupdf.open('data/files/' + d['storage_path'])
        entry['inputs'] = []
        for i, page in enumerate(doc):
            p = f"data/img/{d['id']}_{i + 1}.png"
            page.get_pixmap(dpi=100).save(p)
            entry['inputs'].append(p)
    picked.append(entry)
    if len(picked) >= count:
        break

os.makedirs(f'data/batches/{name}', exist_ok=True)
json.dump(picked, open(f'data/batches/{name}/manifest.json', 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print(name, len(picked), 'docs', got)
