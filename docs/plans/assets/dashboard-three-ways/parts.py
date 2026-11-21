import re
def match_el(s, start):
    m = re.match(r"<([a-zA-Z0-9-]+)", s[start:]); tag = m.group(1)
    depth = 0
    for t in re.finditer(r"<(/?)%s\b[^>]*?(/?)>" % tag, s[start:]):
        if t.group(2) == "/": 
            if depth == 0: return start + t.end()
            continue
        depth += -1 if t.group(1) else 1
        if depth == 0: return start + t.end()
    raise ValueError("unclosed")
def part(s, name, n=0):
    idx = [m.start() for m in re.finditer(r'data-part="%s"' % name, s)][n]
    start = s.rindex("<", 0, idx)
    return s[start:match_el(s, start)]
def text(h): return re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",h)).strip()
def roots(s, attr='data-chart-export-root'):
    out=[]
    for m in re.finditer(attr, s):
        st=s.rindex("<",0,m.start()); out.append(s[st:match_el(s,st)])
    return out
def enclosing(s, marker, tag):
    i=s.index(marker); st=s.rindex("<"+tag,0,i); return s[st:match_el(s,st)]
