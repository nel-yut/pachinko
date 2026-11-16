#!/usr/bin/env python3
"""index.html + styles.css + src/**/*.js を1つのHTMLに埋め込む（Artifact等、相対パス配信が使えない場所向け）。
使い方: python3 scripts/bundle-single.py out.html [--no-verify]"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = sys.argv[1]; no_verify = '--no-verify' in sys.argv
entry = 'src/ui/main.js'
order, seen = [], set()
def deps(p):
    return [str((root / pathlib.Path(p).parent / m).resolve().relative_to(root)) for m in re.findall(r"from\s+'(\.[^']+)'", (root / p).read_text())]
def visit(p):
    if p in seen: return
    seen.add(p)
    for d in deps(p): visit(d)
    order.append(p)
visit(entry)
parts = []
var = lambda p: '__m_' + re.sub(r'\W', '_', p)
for p in order:
    src = (root / p).read_text()
    if p == 'src/config/features.js' and no_verify:
        src = 'export const FEATURES = { verification: false };\n'
    exports = []
    if re.search(r'^export\s+(?:const|let)\s+\w+\s*=[^;\n]*,\s*\w+\s*=', src, flags=re.M): raise SystemExit(f'{p}: 1行で複数の export 定数宣言は未対応。分けて書くこと')
    def imp(m):
        names, path = m.group(1), m.group(2)
        target = str((root / pathlib.Path(p).parent / path).resolve().relative_to(root))
        names = re.sub(r'(\w+)\s+as\s+(\w+)', r'\1: \2', names)
        return f'const {{{names}}} = {var(target)};'
    src = re.sub(r"import\s*\{([^}]*)\}\s*from\s*'([^']+)';", imp, src)
    def exp_named(m):
        exports.append(m.group(2)); return m.group(1) + ' ' + m.group(2)
    src = re.sub(r'^export\s+((?:async\s+)?(?:const|let|function\*?|class))\s+(\w+)', exp_named, src, flags=re.M)
    def exp_list(m):
        for part in m.group(1).split(','):
            a = part.strip().split(' as ')
            exports.append((a[0].strip(), a[-1].strip()))
        return ''
    src = re.sub(r'^export\s*\{([^}]*)\};?', exp_list, src, flags=re.M)
    ret = ', '.join(e if isinstance(e, str) else (e[0] if e[0] == e[1] else f'{e[1]}: {e[0]}') for e in exports)
    parts.append(f'const {var(p)} = (() => {{\n{src}\nreturn {{ {ret} }};\n}})();')
js = '\n'.join(parts).replace('</script', '<\\/script')
html = (root / 'index.html').read_text()
body = html.split('<body>')[1].split('</body>')[0]
body = re.sub(r'<script type="module".*?</script>', '', body, flags=re.S)
if no_verify: body = re.sub(r'<a id="verifyLink".*?</a>', '', body)
css = (root / 'styles.css').read_text()
page = f'''<title>パチンコ基盤</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{{color-scheme:dark}}
{css}
body{{background:#0b1020;color:#e8eefc;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
.top,.layout{{padding-left:0;padding-right:0}}
</style>
{body}
<script>
{js}
</script>
'''
pathlib.Path(out).write_text(page)
print('wrote', out, len(page), 'bytes')
