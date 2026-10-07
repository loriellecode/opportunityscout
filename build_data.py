"""Build data.json (public site snapshot) from the database export in export/.
Refresh the export first (list each collection with out_dir=export), then run this."""
import json, glob
def load(coll):
    out = []
    for f in sorted(glob.glob(f'export/{coll}/*.json')):
        d = json.load(open(f)); d = d.get('data', d); out.append(d)
    return out
json.dump({'opportunities': load('opportunities'), 'sources': load('sources'), 'scans': load('scans')}, open('data.json', 'w'), ensure_ascii=True)
print({k: len(load(k)) for k in ('opportunities', 'sources', 'scans')})
