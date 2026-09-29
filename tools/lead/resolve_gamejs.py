# resolve game.js slot conflicts: keep HEAD side, put theirs' import/useModule lines into the matching placeholders
import re,sys
import subprocess; p=subprocess.check_output(['git','rev-parse','--show-toplevel']).decode().strip()+'/src/game/game.js'; s=open(p).read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
def fix(m):
    head, theirs = m.group(1), m.group(2)
    extra=[]
    for line in theirs.splitlines():
        mi=re.match(r"\s*import \{ install(\w+) \} from '\./(\w+)\.js'", line)
        mu=re.match(r"\s*this\.useModule\('(\w+)'", line)
        name = mi.group(2) if mi else (mu.group(1) if mu else None)
        if name is None:
            if line.strip() and line.strip() not in head: extra.append(line)
            continue
        key = ('// [import:%s]' if mi else '    // [slot:%s]') % name
        if key in head and name != 'guide': head = head.replace(key, line, 1)
        else:
            head = head.replace(key+'\n', '', 1) if key in head else head
            extra.append(line)
    return head + ('\n'.join(extra)+'\n' if extra else '')
s2=pat.sub(fix,s)
assert '<<<<<<<' not in s2
open(p,'w').write(s2)
print('resolved')
