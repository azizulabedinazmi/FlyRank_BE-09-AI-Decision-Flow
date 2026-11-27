"""Generate docs/banner.svg: a decision flow running, animated (pure SVG + CSS, loops, no JS).

    python docs/make_banner.py docs/banner.svg

The run shown is the real one from the README: "How much does the team plan cost, and can we book a demo?"
Start -> Support request? NO -> Buying intent? YES -> Sales team.
"""
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "docs/banner.svg"
W, H, LOOP = 1280, 640, 12.0
END = (92.0, 97.0)
MONO = "Consolas,Menlo,monospace"
YES, NO, NEXT, AMBER = "#34D399", "#FB7185", "#94A3B8", "#F2C66D"
css: list[str] = []
reduced: list[str] = []


def kf(name: str, prop: str, off: str, on: str, at: float, ramp: float = 2.0) -> str:
    css.append(f"@keyframes {name}{{0%,{at:.1f}%{{{prop}:{off}}}{at + ramp:.1f}%,{END[0]}%{{{prop}:{on}}}{END[1]}%,100%{{{prop}:{off}}}}}"
               f".{name}{{animation:{name} {LOOP}s linear infinite}}")
    reduced.append(f".{name}{{{prop}:{on}}}")
    return name


def appear(name: str, at: float) -> str:
    return kf(name, "opacity", "0", "1", at)


def draw(name: str, at: float) -> str:
    """A taken edge draws itself from source to target (pathLength=1)."""
    return kf(name, "stroke-dashoffset", "1", "0", at, 5.0)


def think(name: str, at: float, color: str) -> str:
    """The node's border goes amber while the model is asked, then takes the answer's colour."""
    css.append(f"@keyframes {name}{{0%,{at:.1f}%{{stroke:#2B4A44}}{at + 1:.1f}%{{stroke:{AMBER}}}{at + 7:.1f}%,{END[0]}%{{stroke:{color}}}"
               f"{END[1]}%,100%{{stroke:#2B4A44}}}}.{name}{{animation:{name} {LOOP}s linear infinite}}")
    reduced.append(f".{name}{{stroke:{color}}}")
    return name


# nodes: id -> (cx, cy, w, label, kind)
NODES = {
    "start": (958, 168, 150, "Incoming message", "start"),
    "support": (958, 252, 170, "Support request?", "decision"),
    "bug": (835, 340, 150, "Bug or outage?", "decision"),
    "buying": (1081, 340, 150, "Buying intent?", "decision"),
    "eng": (774, 428, 108, "Engineering", "outcome"),
    "team": (893, 428, 108, "Support", "outcome"),
    "sales": (1022, 428, 108, "Sales", "outcome"),
    "inbox": (1141, 428, 108, "Inbox", "outcome"),
}
NH = 40
# edges: (source, target, handle)
EDGES = [("start", "support", "next"), ("support", "bug", "yes"), ("support", "buying", "no"),
         ("bug", "eng", "yes"), ("bug", "team", "no"), ("buying", "sales", "yes"), ("buying", "inbox", "no")]
# the path this run takes: node -> (time it lights up, colour it ends in)
LIT = {"start": (6, NEXT), "support": (17, NO), "buying": (37, YES), "sales": (56, YES)}
TAKEN = {("start", "support"): 11, ("support", "buying"): 29, ("buying", "sales"): 49}
COLOR = {"yes": YES, "no": NO, "next": NEXT}

edges_svg = []
for i, (s, t, h) in enumerate(EDGES):
    sx, sy, *_ = NODES[s]
    tx, ty, *_ = NODES[t]
    y1, y2 = sy + NH / 2, ty - NH / 2
    mid = (y1 + y2) / 2
    d = f"M{sx} {y1} C{sx} {mid} {tx} {mid} {tx} {y2}"
    col = COLOR[h]
    edges_svg.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-opacity=".18" stroke-width="2"/>')
    if (s, t) in TAKEN:
        edges_svg.append(f'<path d="{d}" pathLength="1" fill="none" stroke="{col}" stroke-width="3.5" stroke-dasharray="1" '
                         f'class="{draw(f"e{i}", TAKEN[(s, t)])}"/>')
    if h != "next":
        lx, ly = (sx + tx) / 2, mid
        cls = f' class="{appear(f"l{i}", TAKEN[(s, t)])}"' if (s, t) in TAKEN else ' opacity=".35"'
        edges_svg.append(f'<g{cls}><rect x="{lx - 17}" y="{ly - 10}" width="34" height="20" rx="10" fill="#051F21" stroke="{col}"/>'
                         f'<text x="{lx}" y="{ly + 4.5}" text-anchor="middle" class="mono" font-size="11" font-weight="700" fill="{col}">'
                         f'{h.upper()}</text></g>')

nodes_svg = []
for nid, (cx, cy, w, label, kind) in NODES.items():
    x, y = cx - w / 2, cy - NH / 2
    on = nid in LIT
    eyebrow = {"start": "START", "decision": "AI DECISION", "outcome": "OUTCOME"}[kind]
    stroke = f'class="{think(f"n_{nid}", LIT[nid][0], LIT[nid][1])}"' if on else 'stroke="#2B4A44"'
    nodes_svg.append(
        f'<g opacity="{1 if on else .42}"><rect x="{x}" y="{y}" width="{w}" height="{NH}" rx="9" fill="#0B2A2A" stroke-width="2.5" {stroke}/>'
        f'<text x="{x + 11}" y="{y + 15}" class="mono" font-size="9.5" letter-spacing="1" fill="#6E8F85">{eyebrow}</text>'
        f'<text x="{x + 11}" y="{y + 32}" font-size="14" font-weight="600" fill="#E8F3EE">{label}</text></g>')

# the execution log, one line per Inngest step, in execution order
LOG = [("#1", "start", "Incoming message", "", NEXT, 7),
       ("#2", "decision", "Support request?", "NO   259 ms", NO, 24),
       ("#3", "decision", "Buying intent?", "YES   55 ms", YES, 44),
       ("#4", "outcome", "Sales team", "done ✓", YES, 58)]
log_svg = []
for i, (n, kind, label, res, col, at) in enumerate(LOG):
    y = 506 + i * 26
    log_svg.append(f'<g class="{appear(f"log{i}", at)}"><text x="728" y="{y}" class="mono" font-size="14" fill="#6E8F85">{n}</text>'
                   f'<text x="764" y="{y}" class="mono" font-size="14" fill="#B9D3C8">{kind:<9}</text>'
                   f'<text x="858" y="{y}" class="mono" font-size="14" fill="#E8F3EE">{label}</text>'
                   f'<text x="1190" y="{y}" text-anchor="end" class="mono" font-size="14" font-weight="700" fill="{col}">{res}</text></g>')

css.append("@media (prefers-reduced-motion: reduce){*{animation:none!important}" + "".join(reduced) + "}")

chips, x = "", 72
for text in ["React Flow", "Inngest", "OpenAI SDK", "YES / NO"]:
    w = 20 + 10.2 * len(text)
    chips += (f'<rect x="{x + 1}" y="404" width="{w - 2}" height="34" rx="8" fill="none" stroke="#6FDCA4" stroke-width="2"/>'
              f'<text x="{x + w / 2}" y="427" text-anchor="middle" class="chip">{text}</text>')
    x += w + 10

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">
<title id="t">AI Decision Flow: a visual workflow of YES/NO AI steps, run by Inngest</title>
<desc id="d">Animated run of the example flow: an incoming message asking about price and a demo enters at Start, the
"Support request?" step answers NO, the "Buying intent?" step answers YES, and the run ends at the Sales outcome, while an
execution log lists each Inngest step in order. By Azizul Abedin Azmi, FlyRank verified.</desc>
<defs>
 <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#FFFFFF" stroke-opacity=".035"/></pattern>
 <radialGradient id="g1" cx="85%" cy="15%" r="45%"><stop offset="0" stop-color="#2ECC80" stop-opacity=".18"/><stop offset="1" stop-color="#2ECC80" stop-opacity="0"/></radialGradient>
 <radialGradient id="g2" cx="10%" cy="95%" r="50%"><stop offset="0" stop-color="#1A7A4A" stop-opacity=".35"/><stop offset="1" stop-color="#1A7A4A" stop-opacity="0"/></radialGradient>
 <style>
  text{{font-family:"Segoe UI",-apple-system,Roboto,Helvetica,Arial,sans-serif}}
  .eyebrow{{font-size:17px;letter-spacing:3px;font-weight:600;fill:#6FDCA4}}
  .h1{{font-size:84px;font-weight:800;fill:#fff;letter-spacing:-2px}}
  .sub{{font-size:25px;fill:#B9D3C8}}
  .chip{{font-family:{MONO};font-size:16px;font-weight:700;fill:#6FDCA4}}
  .name{{font-size:22px;font-weight:600;fill:#fff}}
  .mono{{font-family:{MONO}}}
  {"".join(css)}
 </style>
</defs>
<rect width="{W}" height="{H}" fill="#051F21"/><rect width="{W}" height="{H}" fill="url(#g2)"/>
<rect width="{W}" height="{H}" fill="url(#g1)"/><rect width="{W}" height="{H}" fill="url(#grid)"/>

<text x="72" y="98" class="eyebrow">FLYRANK AI INTERNSHIP · BE-09 · WEEK 7</text>
<text x="66" y="190" class="h1">AI Decision</text>
<text x="66" y="276" class="h1">Flow</text>
<text x="72" y="334" class="sub">Every node asks the model one question.</text>
<text x="72" y="368" class="sub">YES or NO picks the next edge.</text>
{chips}
<text x="72" y="566" class="name">Azizul Abedin Azmi</text>
<circle cx="292" cy="559" r="3" fill="#4C7A6B"/>
<rect x="308" y="539" width="352" height="38" rx="19" fill="#fff"/>
<text x="332" y="564" font-size="17" font-weight="700" fill="#1A7A4A">✓</text>
<text x="352" y="564" font-size="16" font-weight="700" fill="#051F21">FlyRank verified</text>
<line x1="490" y1="549" x2="490" y2="567" stroke="#E4EAED"/>
<text x="500" y="563" fill="#6E7F84" style="font-family:Consolas,Menlo,monospace;font-size:13px">FR-D1-A84A9-AB526</text>

<rect x="700" y="64" width="516" height="550" rx="18" fill="#020E0F" fill-opacity=".78" stroke="#6FDCA4" stroke-opacity=".22"/>
<circle cx="726" cy="90" r="6" fill="#2B4A44"/><circle cx="746" cy="90" r="6" fill="#2B4A44"/><circle cx="766" cy="90" r="6" fill="#2B4A44"/>
<text x="1192" y="95" text-anchor="end" class="mono" font-size="13" fill="#6E8F85">inngest: run-decision-flow</text>
<text x="728" y="128" class="mono" font-size="13" fill="#6E8F85">input</text>
<text x="776" y="128" class="mono" font-size="13" fill="#E8F3EE">"How much is the team plan? Can we book a demo?"</text>
{"".join(edges_svg)}
{"".join(nodes_svg)}
<line x1="724" y1="474" x2="1192" y2="474" stroke="#2B4A44"/>
{"".join(log_svg)}
</svg>
'''
open(OUT, "w", encoding="utf-8", newline="\n").write(svg)
print("wrote", OUT, len(svg), "bytes")
