// Builds writeup/Gravity_Slingshot_Writeup.docx: the Word version of the PDF
// made by make_pdf.py (same text, 12 pt Arial, US Letter).
// Usage: node writeup/make_docx.cjs   (needs `npm install docx`)
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, AlignmentType,
} = require('docx');

const NAME = 'Nishad Mansoor';
const LINK = 'https://gravity-slingshot.gravity-slingshot.workers.dev';
const OWN_PLAYTEST = '[ADD 1–2 sentences about your own play-testing: how far you got, '
  + 'what felt hard or fun, anything you changed.]';

const FONT = 'Arial';
const BODY = 24; // half-points → 12 pt

// Tiny markup: **bold** and _italic_ inside a string → TextRuns.
function runs(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun(text.slice(last, m.index)));
    const t = m[0];
    out.push(t.startsWith('**') ? new TextRun({ text: t.slice(2, -2), bold: true })
      : new TextRun({ text: t.slice(1, -1), italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun(text.slice(last)));
  return out;
}
const p = (text) => new Paragraph({ children: runs(text) });
const h2 = (text) => new Paragraph({ style: 'Heading2', children: [new TextRun(text)] });
const bullet = (text) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(text) });

// Letter width 12240 − 2 × 1224 margins = 9792 DXA of content.
const COLS = [1800, 2952, 2736, 2304];
const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };
function table(rows) {
  return new Table({
    width: { size: 9792, type: WidthType.DXA },
    columnWidths: COLS,
    rows: rows.map((row, r) => new TableRow({
      tableHeader: r === 0,
      children: row.map((c, i) => new TableCell({
        width: { size: COLS[i], type: WidthType.DXA },
        borders,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: r === 0 ? { fill: 'E8ECF4', type: ShadingType.CLEAR, color: 'auto' } : undefined,
        children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: c, bold: r === 0 })] })],
      })),
    })),
  });
}

const children = [
  new Paragraph({ style: 'Title', children: [new TextRun('Gravity Slingshot')] }),
  new Paragraph({
    children: [
      new TextRun({ text: 'Name: ', bold: true }), new TextRun(`${NAME}    `),
      new TextRun({ text: 'Playable link: ', bold: true }),
      new ExternalHyperlink({ link: LINK, children: [new TextRun({ text: LINK, style: 'Hyperlink' })] }),
    ],
  }),

  h2('Game description'),
  p('**Objective.** Launch a probe and use gravity to bend its path into a glowing target ring. Eight '
    + 'handcrafted levels introduce planets (pull), black holes (strong pull, with an event horizon larger '
    + 'than the visible sphere), repellers (push), collectible stars, and an orbiting planet where the '
    + 'moment you release matters.'),
  p('**Controls.** Press on the launcher and pull back like a slingshot: the shot goes opposite the drag, '
    + 'and drag length sets power. Release to fire; after that, physics takes over. Mouse and touch both '
    + 'work. _R_ cancels aiming or skips the flight, holding _Space_ fast-forwards, and _Esc_ pauses.'),
  p('**Scoring.** Each level allows 5 shots. Clearing it on shot N earns (6 − N) × 100 points, plus 50 per '
    + 'star collected on the winning shot. Missing all 5 shots ends the run. The maximum is 4,300. Scores go '
    + 'on a server-side leaderboard.'),
  p('**What I designed to make it hard for AI:**'),
  bullet('**Limited information.** The aim preview shows only the first 15% of the path, so players must '
    + 'imagine where gravity takes the rest.'),
  bullet('**Perception and precision.** A tilted 3D camera means the on-screen drag direction is not the '
    + 'launch angle, and hit or miss is often a 1–4 pixel difference. Level 7 also needs timing against a '
    + 'moving planet.'),
  bullet('**Server-authoritative scoring.** The browser sends only the launch inputs (angle, power, release '
    + 'time). A Cloudflare Worker re-runs the same deterministic physics, decides hit, crash or miss, and '
    + 'computes the score. The client never sends a score. Levels are revealed one at a time after the '
    + 'server confirms a clear. The server allows 5 shots per level and one shot every 1.5 seconds.'),
  bullet("**Hidden per-run variation.** A secret seed, never sent to the browser, nudges every planet's mass "
    + 'by 5–12% each run.'),

  h2('Development process and AI tricks'),
  p('I used **Claude Code** (Claude Opus 5.5) in the Claude desktop app to write all of the code. Its '
    + 'built-in browser handled play-testing, and fresh sub-agents challenged the game. The stack is '
    + 'Three.js with Vite, a Cloudflare Worker with a D1 database, and one physics file shared by both.'),
  bullet('**Spec first.** Before any code, I wrote an AGENTS.md spec covering priorities in order (fun for '
    + 'humans, then hard for AI, then unforgeable scores), exact physics rules (a fixed 1/120 s timestep, '
    + 'symplectic Euler, inputs rounded to fixed steps), the file layout, milestones, and a "don\'ts" list: '
    + 'no physics engine, never trust a score from the client, never show the full trajectory. The agent '
    + 'built the game milestone by milestone against it.'),
  bullet('**Determinism as anti-cheat.** The same physics code runs in the browser (preview only) and on the '
    + "server (the real result). Because inputs are rounded to integers, the server's result is identical "
    + 'every time, and tests prove it.'),
  bullet('**A solver to tune levels.** I had the AI write a script that fires thousands of simulated shots at '
    + 'each level. It proved every level is winnable and measured difficulty as the share of launches that '
    + 'hit. It caught real problems: level 6 had _zero_ solutions, because the repeller shadowed the target, '
    + 'and level 8 had 0.01%. Stars were placed on actual winning paths.'),
  bullet('**Tests for cheating.** 30 automated tests include forged requests: a locked level, replaying a '
    + 'cleared level, a 6th shot, shots too fast, an injected score or hit flag, a double submit, an expired '
    + "run, and simultaneous duplicate shots. A version number on each run means racing requests can't both "
    + 'count.'),
  bullet('**Readable for humans.** A "rubber-sheet" grid sags around heavy bodies so gravity is visible, '
    + 'faint trails show earlier shots, and the camera never moves while you aim.'),

  h2('Testing: challenging my own game with AI agents'),
  p(OWN_PLAYTEST),
  p('Then I gave the deployable build to two fresh AI agents that knew nothing about the code:'),
  table([
    ['Agent', 'Access', 'Result', 'Effort'],
    ['Browser agent', 'Screenshots, clicks and drags only', '2,100 points, 6 of 8 levels', '~113 actions, ~15 min'],
    ['Coding agent', "The site's served JavaScript plus its API", '4,250 of 4,300, every level on the first shot',
      '~7 min, 11 API calls'],
  ]),
  new Paragraph({ spacing: { after: 0 }, children: [] }),
  p('The browser agent played like a careful human. It bracketed shots using the faint trails of earlier '
    + 'attempts, and struggled with the 3D perspective, pixel-level margins and orbit timing. The coding agent '
    + 'pulled the physics out of the minified bundle, searched for winning shots offline in under a second '
    + 'per level, then submitted ordinary, legitimate shots. **Neither agent could fake a score**, so the '
    + 'server-side checks held. One trick: my first coding-agent prompt asked it to "attack" the game, and '
    + 'Anthropic\'s safety filter stopped it. Asking it instead to "play through the API" produced the result '
    + 'above.'),
  p('**Revisions from AI testing.** "Quit run" silently discarded the score, so it became "End run & save '
    + 'score". A green planet was mistaken for a second target, so I recolored it. The menu now says to '
    + '_hold_ Space.'),
  p('**The hidden-variation experiment.** To slow the coding agent down, I added the secret per-run mass '
    + 'nudges. Then I had the AI measure the most reliable shot a bot could choose. Every level still had a '
    + 'fast, nearly straight shot that hits whatever the hidden masses are, because gravity barely bends a '
    + 'fast probe. Even with 15–30% nudges, 6 of 8 levels kept such a shot. The animated path the server '
    + 'returns also reveals enough to work out the hidden masses after one shot.'),

  h2('What I learned'),
  p('Making the server the authority stops fake scores, but not skilled bots. A game whose rules are fully '
    + 'visible and always give the same result is a solved puzzle for a coding agent. Perception challenges '
    + 'like perspective, tiny margins and timing slow only screen-based agents. To be hard for coding agents '
    + 'too, a level needs hidden information that matters on _every_ route. My next step would be levels '
    + 'where every path must curve tightly around bodies, so the hidden masses always matter.'),
];

const doc = new Document({
  creator: NAME,
  title: 'Gravity Slingshot',
  styles: {
    default: { document: { run: { font: FONT, size: BODY }, paragraph: { spacing: { after: 100, line: 276 } } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal',
        run: { font: FONT, size: 36, bold: true }, paragraph: { spacing: { before: 0, after: 60 }, keepNext: true } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 26, bold: true }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 260 } } } }],
    }],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1224, right: 1224 } } },
    children,
  }],
});

const out = path.join(__dirname, 'Gravity_Slingshot_Writeup.docx');
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log(out); });
