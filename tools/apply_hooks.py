"""Apply integration hooks returned by feature-building agents.

Agents that wrote feature modules returned a list of hooks: {file, anchor, mode: after|before|replace, code}.
They are stored in Claude Code workflow journals (one JSON object per line). Usage:

    PYTHONIOENCODING=utf-8 python tools/apply_hooks.py <journal.jsonl | wf_id> <label> [skipIdx ...]

A bare wf_id is resolved under JOURNAL_DIR below. A hook whose code is already present is skipped, so running a
label twice is safe. Always `node --check` the touched files afterwards and smoke-test in the browser.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOURNAL_DIR = r'C:\Users\Sher\.claude\projects\D--KefalCompany\459d8598-a1fc-487e-8194-c75979b48f71\subagents\workflows'

os.chdir(ROOT)
src, label = sys.argv[1], sys.argv[2]
skip = set(sys.argv[3:])
J = src if src.endswith('.jsonl') else os.path.join(JOURNAL_DIR, src, 'journal.jsonl')
L = [json.loads(l) for l in open(J, encoding='utf-8')]
st = {l['key']: l.get('label') for l in L if l.get('type') == 'started'}
hooks = None
for l in L:
    if l.get('type') == 'result' and st.get(l['key']) == label:
        v = l.get('result', l.get('value'))
        hooks = (v or {}).get('hooks') or []
if hooks is None:
    print('no result for', label); sys.exit(1)
for i, h in enumerate(hooks):
    if str(i) in skip:
        print(f'[{i}] skipped'); continue
    f = h['file']
    try:
        s = open(f, encoding='utf-8').read()
    except FileNotFoundError:
        print(f'[{i}] missing file {f}'); continue
    a, code, mode = h['anchor'], h['code'], h['mode']
    if code.strip() and code.strip() in s:
        print(f'[{i}] already present in {f}'); continue
    if a not in s:
        a2 = a.strip()
        if a2 and a2 in s: a = a2
        else:
            print(f'[{i}] ANCHOR NOT FOUND in {f}: {a[:90]!r}'); continue
    if mode == 'replace':
        s = s.replace(a, code, 1)
    elif mode == 'before':
        idx = s.index(a)
        ls = s.rfind('\n', 0, idx) + 1
        s = s[:ls] + code.rstrip('\n') + '\n' + s[ls:]
    else:  # after: insert after the end of the anchor's line
        idx = s.index(a) + len(a)
        le = s.find('\n', idx)
        if le < 0: le = len(s)
        s = s[:le] + '\n' + code.rstrip('\n') + s[le:]
    open(f, 'w', encoding='utf-8').write(s)
    print(f'[{i}] ok {f} ({mode})')
