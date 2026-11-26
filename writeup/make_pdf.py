"""Builds writeup/Gravity_Slingshot_Writeup.pdf (12 pt, US Letter, < 3 pages).

Edit the text below, then run:
    python3 writeup/make_pdf.py
(needs `pip install reportlab`).
"""
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem

NAME = "Nishad Mansoor"
LINK = '<link href="https://gravity-slingshot.gravity-slingshot.workers.dev" color="blue">https://gravity-slingshot.gravity-slingshot.workers.dev</link>'
OWN_PLAYTEST = ("[ADD 1–2 sentences about your own play-testing: how far you got, "
                "what felt hard or fun, anything you changed.]")

OUT = Path(__file__).with_name("Gravity_Slingshot_Writeup.pdf")

BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=12, leading=14.6, spaceAfter=5)
H1 = ParagraphStyle("h1", parent=BODY, fontName="Helvetica-Bold", fontSize=18, leading=22, spaceAfter=2)
H2 = ParagraphStyle("h2", parent=BODY, fontName="Helvetica-Bold", fontSize=13, leading=16, spaceBefore=7, spaceAfter=3, keepWithNext=1)
CELL = ParagraphStyle("cell", parent=BODY, spaceAfter=0)
CELLB = ParagraphStyle("cellb", parent=CELL, fontName="Helvetica-Bold")


def p(text):
    return Paragraph(text, BODY)


def bullets(items):
    return ListFlowable([ListItem(Paragraph(t, BODY), leftIndent=14) for t in items],
                        bulletType="bullet", start="•", leftIndent=14, bulletFontSize=10)


def table(rows, widths):
    data = [[Paragraph(c, CELLB if r == 0 else CELL) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8ecf4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


story = [
    Paragraph("Gravity Slingshot", H1),
    p(f"<b>Name:</b> {NAME} &nbsp;&nbsp; <b>Playable link:</b> {LINK}"),

    Paragraph("Game description", H2),
    p("<b>Objective.</b> Launch a probe and use gravity to bend its path into a glowing target ring. "
      "Eight handcrafted levels introduce planets (pull), black holes (strong pull, with an event horizon "
      "larger than the visible sphere), repellers (push), collectible stars, and an orbiting planet where "
      "the moment you release matters."),
    p("<b>Controls.</b> Press on the launcher and pull back like a slingshot: the shot goes opposite "
      "the drag, and drag length sets power. Release to fire; after that, physics takes over. Mouse and "
      "touch both work. <i>R</i> cancels aiming or skips the flight, holding <i>Space</i> fast-forwards, "
      "and <i>Esc</i> pauses."),
    p("<b>Scoring.</b> Each level allows 5 shots. Clearing it on shot N earns (6 − N) × 100 points, plus "
      "50 per star collected on the winning shot. Missing all 5 shots ends the run. The maximum is 4,300. "
      "Scores go on a server-side leaderboard."),
    p("<b>What I designed to make it hard for AI:</b>"),
    bullets([
        "<b>Limited information.</b> The aim preview shows only the first 15% of the path, so players "
        "must imagine where gravity takes the rest.",
        "<b>Perception and precision.</b> A tilted 3D camera means the on-screen drag direction is not "
        "the launch angle, and hit or miss is often a 1–4 pixel difference. Level 7 also needs timing "
        "against a moving planet.",
        "<b>Server-authoritative scoring.</b> The browser sends only the launch inputs (angle, power, "
        "release time). A Cloudflare Worker re-runs the same deterministic physics, decides hit, crash "
        "or miss, and computes the score. The client never sends a score. Levels are revealed one at a "
        "time after the server confirms a clear. The server allows 5 shots per level and one shot every "
        "1.5 seconds.",
        "<b>Hidden per-run variation.</b> A secret seed, never sent to the browser, nudges every "
        "planet's mass by 5–12% each run.",
    ]),

    Paragraph("Development process and AI tricks", H2),
    p("I used <b>Claude Code</b> (Claude Opus 5.5) in the Claude desktop app to write all of the code. "
      "Its built-in browser handled play-testing, and fresh sub-agents challenged the game. The stack is "
      "Three.js with Vite, a Cloudflare Worker with a D1 database, and one physics file shared by both."),
    bullets([
        "<b>Spec first.</b> Before any code, I wrote an AGENTS.md spec covering priorities in order (fun "
        "for humans, then hard for AI, then unforgeable scores), exact physics rules (a fixed 1/120 s "
        "timestep, symplectic Euler, inputs rounded to fixed steps), the file layout, milestones, and a "
        "\"don'ts\" list: no physics engine, never trust a score from the client, never show the full "
        "trajectory. The agent built the game milestone by milestone against it.",
        "<b>Determinism as anti-cheat.</b> The same physics code runs in the browser (preview only) and "
        "on the server (the real result). Because inputs are rounded to integers, the server's result "
        "is identical every time, and tests prove it.",
        "<b>A solver to tune levels.</b> I had the AI write a script that fires thousands of simulated "
        "shots at each level. It proved every level is winnable and measured difficulty as the share of "
        "launches that hit. It caught real problems: level 6 had <i>zero</i> solutions, because the "
        "repeller shadowed the target, and level 8 had 0.01%. Stars were placed on actual winning paths.",
        "<b>Tests for cheating.</b> 30 automated tests include forged requests: a locked level, "
        "replaying a cleared level, a 6th shot, shots too fast, an injected score or hit flag, a double "
        "submit, an expired run, and simultaneous duplicate shots. A version number on each run means "
        "racing requests can't both count.",
        "<b>Readable for humans.</b> A \"rubber-sheet\" grid sags around heavy bodies so gravity is "
        "visible, faint trails show earlier shots, and the camera never moves while you aim.",
    ]),

    Paragraph("Testing: challenging my own game with AI agents", H2),
    p(OWN_PLAYTEST),
    p("Then I gave the deployable build to two fresh AI agents that knew nothing about the code:"),
    table([
        ["Agent", "Access", "Result", "Effort"],
        ["Browser agent", "Screenshots, clicks and drags only",
         "2,100 points, 6 of 8 levels", "~113 actions, ~15 min"],
        ["Coding agent", "The site's served JavaScript plus its API",
         "4,250 of 4,300, every level on the first shot", "~7 min, 11 API calls"],
    ], [1.25 * inch, 2.0 * inch, 1.9 * inch, 1.55 * inch]),
    Spacer(1, 6),
    p("The browser agent played like a careful human. It bracketed shots using the faint trails of "
      "earlier attempts, and struggled with the 3D perspective, pixel-level margins and orbit timing. "
      "The coding agent pulled the physics out of the minified bundle, searched for winning shots "
      "offline in under a second per level, then submitted ordinary, legitimate shots. <b>Neither "
      "agent could fake a score</b>, so the server-side checks held. One trick: my first coding-agent "
      "prompt asked it to \"attack\" the game, and Anthropic's safety filter stopped it. Asking it "
      "instead to \"play through the API\" produced the result above."),
    p("<b>Revisions from AI testing.</b> \"Quit run\" silently discarded the score, so it became "
      "\"End run &amp; save score\". A green planet was mistaken for a second target, so I recolored "
      "it. The menu now says to <i>hold</i> Space."),
    p("<b>The hidden-variation experiment.</b> To slow the coding agent down, I added the secret "
      "per-run mass nudges. Then I had the AI measure the most reliable shot a bot could choose. Every "
      "level still had a fast, nearly straight shot that hits whatever the hidden masses are, because "
      "gravity barely bends a fast probe. Even with 15–30% nudges, 6 of 8 levels kept such a shot. "
      "The animated path the server returns also reveals enough to work out the hidden masses after "
      "one shot."),

    Paragraph("What I learned", H2),
    p("Making the server the authority stops fake scores, but not skilled bots. A game whose rules are "
      "fully visible and always give the same result is a solved puzzle for a coding agent. Perception "
      "challenges like perspective, tiny margins and timing slow only screen-based agents. To be hard "
      "for coding agents too, a level needs hidden information that matters on <i>every</i> route. My "
      "next step would be levels where every path must curve tightly around bodies, so the hidden "
      "masses always matter."),
]

doc = SimpleDocTemplate(str(OUT), pagesize=letter, leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
                        title="Gravity Slingshot", author=NAME)
doc.build(story)
print(OUT)
