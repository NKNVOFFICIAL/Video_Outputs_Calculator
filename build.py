"""Собирает index.html из src/: страница + расчёт + парк оборудования."""
from pathlib import Path
src = Path(__file__).parent / "src"
page = (src / "page.html").read_text(encoding="utf-8")
calc = (src / "calc.js").read_text(encoding="utf-8").replace('if (typeof module !== "undefined") module.exports = VC;', "")
inv = (src / "inventory.js").read_text(encoding="utf-8")
body = page.replace("/*CALC*/", calc).replace("/*INV*/", inv)
html = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>\n'
        + body + "\n</html>\n")
(Path(__file__).parent / "index.html").write_text(html, encoding="utf-8")
print("index.html собран")
