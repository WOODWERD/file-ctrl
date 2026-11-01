#!/usr/bin/env python3
"""Rewrites site/icons/tabler.json from an unpacked @tabler/icons npm package.
Usage: make-icons.py <package dir> <custom-soldering-iron.svg>
Each entry is name: [path data, search words]. Brand and grouped icons are left out."""
import json, re, sys

def num(v): return ('%.3f' % float(v)).rstrip('0').rstrip('.')

def to_path(tag, a):
    if tag == 'path': return a['d']
    if tag == 'circle':
        x, y, r = float(a['cx']), float(a['cy']), float(a['r'])
        return f"M{num(x-r)} {num(y)}a{num(r)} {num(r)} 0 1 0 {num(2*r)} 0a{num(r)} {num(r)} 0 1 0 {num(-2*r)} 0"
    if tag == 'ellipse':
        x, y, rx, ry = map(float, (a['cx'], a['cy'], a['rx'], a['ry']))
        return f"M{num(x-rx)} {num(y)}a{num(rx)} {num(ry)} 0 1 0 {num(2*rx)} 0a{num(rx)} {num(ry)} 0 1 0 {num(-2*rx)} 0"
    if tag == 'line': return f"M{a['x1']} {a['y1']}L{a['x2']} {a['y2']}"
    if tag == 'rect':
        x, y, w, h = map(float, (a['x'], a['y'], a['width'], a['height'])); r = float(a.get('rx', 0))
        if not r: return f"M{num(x)} {num(y)}h{num(w)}v{num(h)}h{num(-w)}z"
        return (f"M{num(x+r)} {num(y)}h{num(w-2*r)}a{num(r)} {num(r)} 0 0 1 {num(r)} {num(r)}v{num(h-2*r)}"
                f"a{num(r)} {num(r)} 0 0 1 {num(-r)} {num(r)}h{num(2*r-w)}a{num(r)} {num(r)} 0 0 1 {num(-r)} {num(-r)}"
                f"v{num(2*r-h)}a{num(r)} {num(r)} 0 0 1 {num(r)} {num(-r)}z")
    if tag in ('polyline', 'polygon'):
        p = a['points'].replace(',', ' ').split()
        return 'M' + p[0] + ' ' + p[1] + ''.join(f'L{p[i]} {p[i+1]}' for i in range(2, len(p), 2)) + ('z' if tag == 'polygon' else '')
    return None

pkg, iron = sys.argv[1], sys.argv[2]
nodes = json.load(open(pkg + '/tabler-nodes-outline.json'))
meta = json.load(open(pkg + '/icons.json'))
out = {}
for name, parts in nodes.items():
    if name.startswith('brand-'): continue
    paths = [to_path(p[0], p[1]) for p in parts]
    if None in paths: continue
    m = meta.get(name, {})
    words = [str(w) for w in m.get('tags', [])] + ([m['category'].lower()] if m.get('category') else [])
    out[name] = [' '.join(paths), ' '.join(words)]
out['custom-soldering-iron'] = [' '.join(re.findall(r'd="([^"]+)"', open(iron).read())), 'solder soldering iron tip heat']
json.dump(out, open('site/icons/tabler.json', 'w'), separators=(',', ':'))
print(len(out), 'icons')
