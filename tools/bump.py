#!/usr/bin/env python3
"""Bump HOLO's cache version everywhere: index.html, every ES-module import, sw.js.
Usage: python3 tools/bump.py   (increments the number in sw.js CACHE)"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
sw = (root / 'sw.js').read_text()
v = int(re.search(r"holo-v(\d+)", sw).group(1)) + 1
tag = lambda m: f"{m.group(1)}?v={v}{m.group(2)}"
# index.html: css + js refs
p = root / 'index.html'; s = p.read_text()
s = re.sub(r"((?:css|js)/[\w-]+\.(?:css|js))(?:\?v=\d+)?(\")", tag, s); p.write_text(s)
# every relative import in js/
for f in (root / 'js').glob('*.js'):
    s = f.read_text()
    s = re.sub(r"(from '\./[\w-]+\.js)(?:\?v=\d+)?(')", lambda m: f"{m.group(1)}?v={v}{m.group(2)}", s)
    s = re.sub(r"(import\('\./[\w-]+\.js)(?:\?v=\d+)?(')", lambda m: f"{m.group(1)}?v={v}{m.group(2)}", s)
    f.write_text(s)
# sw.js: cache name + core list
sw = re.sub(r"holo-v\d+", f"holo-v{v}", sw)
sw = re.sub(r"'((?:css|js)/[\w-]+\.(?:css|js))(?:\?v=\d+)?'", lambda m: f"'{m.group(1)}?v={v}'", sw)
(root / 'sw.js').write_text(sw)
print('version', v)
