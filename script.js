'use strict';

// ═══════════════════════════════════════════════════════════
// ██  CONFIGURATION
// ═══════════════════════════════════════════════════════════
const CFG = {
  FONT:         15,          // font size (px)
  LINE:         24,          // line height (px)
  PAD_LEFT:     52,          // left padding (includes line numbers)
  PAD_TOP:      14,          // top padding
  PAD_RIGHT:    60,          // right padding
  LINENUM_W:    46,          // width of line-number gutter
  TAB:          4,           // tab width in spaces
  DRIFT_LINE_DIST:  8,       // begin drifting when cursor is this many lines away
  RETURN_LINE_DIST: 5,       // return when cursor gets within this many lines
  MIN_OPA:      0.08,        // minimum opacity when fully drifted
  MAX_AMP:      140,         // max drift amplitude (px)
  CURSOR_R:     22,          // cursor aura radius
  BLINK:        3.6,         // blink angular speed (rad/s)
  NEW_SETTLE:   0.45,        // seconds before a new char can drift
  CURSOR_SCROLL_LINES: 1,    // how many lines to scroll when cursor leaves viewport
  CURSOR_SCROLL_SMOOTH: false, // smooth scrolling toggle for cursor follow
};

// ═══════════════════════════════════════════════════════════
// ██  SYNTAX – TOKEN COLORS  (Dracula-ish palette)
// ═══════════════════════════════════════════════════════════
const TC = {
  keyword:  '#ff79c6',
  string:   '#f1fa8c',
  comment:  '#6272a4',
  number:   '#bd93f9',
  bracket:  '#50fa7b',
  operator: '#ffb86c',
  builtin:  '#8be9fd',
  default:  '#f8f8f2',
  ws:       '#f8f8f2',
};

// Ethereal pastel palette for drifting characters
const DRIFT_PAL = [
  '#a8d8ff','#c4b5fd','#f9a8d4','#fcd34d',
  '#86efac','#67e8f9','#fde68a','#d8b4fe',
];

// ─── keywords (multi-language) ───────────────────────────
const KEYWORDS = new Set([
  // JS / TS
  'abstract','arguments','async','await','boolean','break',
  'case','catch','class','const','continue','debugger','default',
  'delete','do','else','enum','eval','export','extends',
  'false','finally','for','from','function','if','implements',
  'import','in','instanceof','interface','let','new','null','of',
  'package','private','protected','public','return','static',
  'super','switch','this','throw','true','try','type','typeof',
  'undefined','var','void','while','with','yield',
  'readonly','declare','namespace','module','keyof','infer','never',
  'any','unknown','as','satisfies','override',
  // Python
  'and','as','assert','def','del','elif','except',
  'global','is','lambda','nonlocal','not','or','pass',
  'raise','self','with','print',
  // Rust
  'fn','mut','pub','use','mod','impl','trait','struct',
  'match','where','crate','ref','move','dyn','unsafe','loop',
  // Go
  'chan','defer','fallthrough','go','map','range','select',
  // generic
  'begin','end','then','until','repeat','foreach','each',
]);

const BUILTINS = new Set([
  'console','Math','Array','Object','String','Number','Boolean',
  'RegExp','Date','Promise','Set','Map','JSON','window','document',
  'process','module','require','exports','fetch',
  'setTimeout','setInterval','clearTimeout','clearInterval',
  'parseInt','parseFloat','NaN','Infinity','Symbol',
  'WeakMap','WeakSet','Error','TypeError','RangeError',
  'len','range','str','int','float','list','dict','tuple',
  'println','eprintln','vec','Box','Option','Result',
  'Some','None','Ok','Err','fmt','os','io','fs',
]);

// ═══════════════════════════════════════════════════════════
// ██  TOKENIZER
// ═══════════════════════════════════════════════════════════
/**
 * Returns [{start, end, type}, …]
 * type ∈ 'keyword'|'string'|'comment'|'number'|'bracket'|'operator'|'builtin'|'default'|'ws'
 */
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    // whitespace (space, tab, CR – not newline)
    if (c === ' ' || c === '\t' || c === '\r') {
      let j = i;
      while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
      toks.push({ s: i, e: j, t: 'ws' }); i = j; continue;
    }
    // newline
    if (c === '\n') { toks.push({ s: i, e: i+1, t: 'ws' }); i++; continue; }

    // // line comment
    if (c === '/' && src[i+1] === '/') {
      let j = i;
      while (j < src.length && src[j] !== '\n') j++;
      toks.push({ s: i, e: j, t: 'comment' }); i = j; continue;
    }
    // /* block comment */
    if (c === '/' && src[i+1] === '*') {
      let j = i + 2;
      while (j < src.length - 1 && !(src[j] === '*' && src[j+1] === '/')) j++;
      j += 2;
      toks.push({ s: i, e: j, t: 'comment' }); i = j; continue;
    }
    // # comment (Python / shell)
    if (c === '#') {
      let j = i;
      while (j < src.length && src[j] !== '\n') j++;
      toks.push({ s: i, e: j, t: 'comment' }); i = j; continue;
    }

    // string " ' `
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q)    { j++; break; }
        if (q !== '`' && src[j] === '\n') break;
        j++;
      }
      toks.push({ s: i, e: j, t: 'string' }); i = j; continue;
    }

    // number
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i+1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9a-fA-FxXoObB_.]/.test(src[j])) j++;
      toks.push({ s: i, e: j, t: 'number' }); i = j; continue;
    }

    // bracket / paren / brace
    if ('([{}])'.includes(c)) {
      toks.push({ s: i, e: i+1, t: 'bracket' }); i++; continue;
    }

    // operator / punctuation
    if ('+-*/%=<>!&|^~?:.,;@\\'.includes(c)) {
      toks.push({ s: i, e: i+1, t: 'operator' }); i++; continue;
    }

    // identifier → keyword / builtin / default
    if (/[a-zA-Z_$\u00C0-\uFFFF]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_$\u00C0-\uFFFF]/.test(src[j])) j++;
      const w = src.slice(i, j);
      const t = KEYWORDS.has(w) ? 'keyword' : BUILTINS.has(w) ? 'builtin' : 'default';
      toks.push({ s: i, e: j, t }); i = j; continue;
    }

    toks.push({ s: i, e: i+1, t: 'default' }); i++;
  }
  return toks;
}

/** Build per-character color array  (index → hex string) */
function buildColors(src) {
  const colors = new Array(src.length).fill(TC.default);
  for (const { s, e, t } of tokenize(src)) {
    const c = TC[t] || TC.default;
    for (let i = s; i < e; i++) colors[i] = c;
  }
  return colors;
}

// ═══════════════════════════════════════════════════════════
// ██  COLOR UTILITIES
// ═══════════════════════════════════════════════════════════
function hexToRgb(h) {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
}
function lerpColor(a, b, t) {
  const [r1,g1,b1] = hexToRgb(a);
  const [r2,g2,b2] = hexToRgb(b);
  return rgbToHex(r1+(r2-r1)*t, g1+(g2-g1)*t, b1+(b2-b1)*t);
}

function isWideGlyph(ch) {
  if (!ch) return false;
  const code = ch.codePointAt(0);
  return (
    code >= 0x1100 && (
      code <= 0x115F ||
      code === 0x2329 || code === 0x232A ||
      (code >= 0x2E80 && code <= 0xA4CF && code !== 0x303F) ||
      (code >= 0xAC00 && code <= 0xD7A3) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE10 && code <= 0xFE19) ||
      (code >= 0xFE30 && code <= 0xFE6F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6)
    )
  );
}

function glyphWidth(ch) {
  return isWideGlyph(ch) ? 2 : 1;
}

// ═══════════════════════════════════════════════════════════
// ██  CHAR PARTICLE
// ═══════════════════════════════════════════════════════════
class CharParticle {
  /**
   * @param {string} ch        the character
   * @param {number} hx        home X (canvas px)
   * @param {number} hy        home Y (canvas px, top of line)
   * @param {string} baseColor syntax-highlight hex
   * @param {string} driftColor ethereal hex
   */
  constructor(ch, hx, hy, baseColor, driftColor) {
    this.ch         = ch;
    this.homeX      = hx;
    this.homeY      = hy;
    this.x          = hx;
    this.y          = hy;
    this.vx         = 0;
    this.vy         = 0;
    this.opacity    = 1;
    this.baseColor  = baseColor;
    this.driftColor = driftColor;
    this.blend      = 0;      // 0 = base color, 1 = drift color
    this.drifting   = false;
    this.age        = 0;      // seconds since creation
    this._atHome    = true;   // skip physics when already settled at home

    // Unique organic-motion parameters (figure-eight / lemniscate)
    this._pX = Math.random() * Math.PI * 2;
    this._pY = Math.random() * Math.PI * 2;
    this._fX = 0.25 + Math.random() * 0.40;  // angular frequency X
    this._fY = 0.20 + Math.random() * 0.30;  // angular frequency Y
    this._aX = 45   + Math.random() * CFG.MAX_AMP;
    this._aY = 30   + Math.random() * CFG.MAX_AMP * 0.75;
  }

  /**
   * Integrate physics one step.
   * @param {number} cx  cursor pixel X
   * @param {number} cy  cursor pixel Y
   * @param {number} dt  delta-time in seconds
   */
  update(cx, cy, dt) {
    this.age += dt;

    const cursorLine = Math.round((cy - CFG.PAD_TOP - CFG.LINE * 0.5) / CFG.LINE);
    const homeLine   = Math.round((this.homeY - CFG.PAD_TOP) / CFG.LINE);
    const lineDist   = Math.abs(homeLine - cursorLine);

    const settled  = this.age > CFG.NEW_SETTLE;
    const gosDrift = settled && (
      lineDist > CFG.DRIFT_LINE_DIST ||
      (this.drifting && lineDist > CFG.RETURN_LINE_DIST)
    );

    if (gosDrift) {
      // ── drift: Lissajous orbit around home ──────────────
      this.drifting = true;
      this._pX += dt * this._fX;
      this._pY += dt * this._fY;

      const tx = this.homeX + Math.cos(this._pX) * this._aX;
      const ty = this.homeY + Math.sin(this._pY) * this._aY;

      // Weak spring toward orbit point
      this.vx += (tx - this.x) * 0.055;
      this.vy += (ty - this.y) * 0.055;
      this.vx *= 0.865;
      this.vy *= 0.865;

      this.opacity += (CFG.MIN_OPA - this.opacity) * Math.min(1, dt * 3.5);
      this.blend   += dt * 1.8;
      if (this.blend > 1) this.blend = 1;

    } else {
      // ── return: strong spring toward exact home ──────────
      this.drifting = false;

      this.vx += (this.homeX - this.x) * 0.26;
      this.vy += (this.homeY - this.y) * 0.26;
      this.vx *= 0.74;
      this.vy *= 0.74;

      this.opacity += (1 - this.opacity) * Math.min(1, dt * 8);
      this.blend   -= dt * 3.4;
      if (this.blend < 0) this.blend = 0;
    }

    this.x += this.vx;
    this.y += this.vy;
  }

  /** Interpolated render color */
  get color() {
    if (this.blend <= 0) return this.baseColor;
    if (this.blend >= 1) return this.driftColor;
    return lerpColor(this.baseColor, this.driftColor, this.blend);
  }
}

// ═══════════════════════════════════════════════════════════
// ██  LAYOUT HELPERS
// ═══════════════════════════════════════════════════════════

/** Measured monospace character width (updated after ctx is ready) */
let charW = 9;

/**
 * Returns [{x, y}, …] — canvas-pixel position for each char in src.
 * x = left edge of character cell; y = top of line.
 */
function layout(src) {
  const pos = new Array(src.length);
  let line = 0, col = 0;
  for (let i = 0; i < src.length; i++) {
    pos[i] = { x: CFG.PAD_LEFT + col * charW, y: CFG.PAD_TOP + line * CFG.LINE };
    const c = src[i];
    if (c === '\n') { line++; col = 0; }
    else if (c === '\t') { col = Math.ceil((col + 1) / CFG.TAB) * CFG.TAB; }
    else { col += glyphWidth(c); }
  }
  return pos;
}

/** Text index → {line, col} (visual columns, tabs expanded) */
function idxToLC(src, idx) {
  let line = 0, col = 0;
  const end = Math.min(idx, src.length);
  for (let i = 0; i < end; i++) {
    const c = src[i];
    if (c === '\n') { line++; col = 0; }
    else if (c === '\t') { col = Math.ceil((col + 1) / CFG.TAB) * CFG.TAB; }
    else { col += glyphWidth(c); }
  }
  return { line, col };
}

/** Cursor pixel position (x = left edge of cursor caret, y = vertical center) */
function cursorPx(src, idx) {
  const { line, col } = idxToLC(src, idx);
  return {
    x: CFG.PAD_LEFT + col * charW,
    y: CFG.PAD_TOP  + line * CFG.LINE + CFG.LINE * 0.5,
  };
}

// ═══════════════════════════════════════════════════════════
// ██  EDITOR STATE
// ═══════════════════════════════════════════════════════════
const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d');
const ta         = document.getElementById('hidden-input');
const wrapper    = document.getElementById('editor-wrapper');
const sbPos      = document.getElementById('sb-pos');
const sbChars    = document.getElementById('sb-chars');
const exportBtn  = document.getElementById('export-btn');
const extSel     = document.getElementById('ext-select');
const fnInput    = document.getElementById('filename-input');
const placeholder= document.getElementById('placeholder');

let text      = '';
let particles = [];   // CharParticle[] (newline chars excluded)
let curX      = CFG.PAD_LEFT;
let curY      = CFG.PAD_TOP + CFG.LINE * 0.5;
let blinkT    = 0;
let lastT     = 0;
let composing = false;

const INDENT_UNIT  = ' '.repeat(CFG.TAB);
const BRACKET_PAIRS = {
  '(': ')',
  '[': ']',
  '{': '}',
};
const BRACKET_CLOSERS = new Set(Object.values(BRACKET_PAIRS));

function isExportControl(el) {
  return el === fnInput || el === extSel || el === exportBtn;
}

function shouldKeepExternalFocus() {
  return isExportControl(document.activeElement);
}

function refocusEditorIfNeeded() {
  if (!shouldKeepExternalFocus()) ta.focus();
}

function applyEditorChange(nextText, nextSelStart, nextSelEnd = nextSelStart) {
  ta.value = nextText;
  ta.selectionStart = nextSelStart;
  ta.selectionEnd = nextSelEnd;
  onInput();
}

function lineStartAt(src, idx) {
  let i = idx;
  while (i > 0 && src[i - 1] !== '\n') i--;
  return i;
}

function lineEndAt(src, idx) {
  const nl = src.indexOf('\n', idx);
  return nl === -1 ? src.length : nl;
}

function leadingSpaceCount(line) {
  let n = 0;
  while (n < line.length && line[n] === ' ') n++;
  return n;
}

function removeUpToLeadingSpaces(line, maxSpaces) {
  const rm = Math.min(maxSpaces, leadingSpaceCount(line));
  return { line: line.slice(rm), removed: rm };
}

function selectionLineRange(src, start, end) {
  const lineStart = lineStartAt(src, start);
  const lastIdx = Math.max(start, end - 1);
  const lineEnd = lineEndAt(src, lastIdx);
  return { lineStart, lineEnd };
}

function adjustScrollTop(nextTop) {
  const maxTop = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
  const clamped = Math.max(0, Math.min(maxTop, nextTop));
  if (CFG.CURSOR_SCROLL_SMOOTH) {
    wrapper.scrollTo({ top: clamped, behavior: 'smooth' });
  } else {
    wrapper.scrollTop = clamped;
  }
}

function ensureCursorInViewport() {
  const ci = ta.selectionStart || 0;
  const cp = cursorPx(text, ci);
  const cursorTop = cp.y - 2;
  const cursorBottom = cp.y + 2;
  const viewTop = wrapper.scrollTop;
  const viewBottom = viewTop + wrapper.clientHeight;
  const stepPx = Math.max(1, CFG.CURSOR_SCROLL_LINES) * CFG.LINE;

  if (cursorTop < viewTop) {
    adjustScrollTop(viewTop - stepPx);
  } else if (cursorBottom > viewBottom) {
    adjustScrollTop(viewTop + stepPx);
  }
}

// ─── canvas resize ──────────────────────────────────────────
function resizeCanvas() {
  const dpr   = window.devicePixelRatio || 1;
  const lines = text ? text.split('\n') : [''];
  const maxCols = Math.max(...lines.map(l => {
    // visual length (tabs expanded)
    let col = 0;
    for (const c of l) {
      if (c === '\t') col = Math.ceil((col + 1) / CFG.TAB) * CFG.TAB;
      else col += glyphWidth(c);
    }
    return col;
  }), 40);

  const cw = Math.max(wrapper.clientWidth,
    CFG.PAD_LEFT + maxCols * charW + CFG.PAD_RIGHT);
  const ch = Math.max(wrapper.clientHeight,
    CFG.PAD_TOP + lines.length * CFG.LINE + CFG.PAD_TOP * 4);

  canvas.width        = Math.ceil(cw * dpr);
  canvas.height       = Math.ceil(ch * dpr);
  canvas.style.width  = cw + 'px';
  canvas.style.height = ch + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `${CFG.FONT}px 'Courier New', Courier, monospace`;
  charW = ctx.measureText('M').width;
}

// ─── particle management ────────────────────────────────────
/**
 * Rebuild particles after text changes.
 * Re-uses existing particle objects where possible to preserve visual state.
 */
function rebuildParticles(newSrc) {
  const pos    = layout(newSrc);
  const colors = buildColors(newSrc);

  const newP = [];
  let   pi   = 0;  // index into old particles array

  for (let i = 0; i < newSrc.length; i++) {
    const ch = newSrc[i];
    if (ch === '\n') continue;   // newlines don't get particles

    const hx = pos[i].x;
    const hy = pos[i].y;
    const bc = colors[i];
    const dc = DRIFT_PAL[pi % DRIFT_PAL.length];

    if (pi < particles.length) {
      // Re-use: update char, home position, colors — keep visual/physics state
      const p  = particles[pi];
      p.ch        = ch;
      p.homeX     = hx;
      p.homeY     = hy;
      p.baseColor = bc;
      p.driftColor= dc;
      newP.push(p);
    } else {
      // New particle — spawn at current cursor position so it flies to home
      const cp = cursorPx(newSrc, ta.selectionStart || 0);
      const p  = new CharParticle(ch, hx, hy, bc, dc);
      p.x = cp.x;
      p.y = cp.y - CFG.LINE * 0.5;
      newP.push(p);
    }
    pi++;
  }

  return newP;
}

// ─── rendering ──────────────────────────────────────────────
function render() {
  const W         = parseFloat(canvas.style.width)  || canvas.width;
  const H         = parseFloat(canvas.style.height) || canvas.height;
  const scrollTop = wrapper.scrollTop;
  const vpH       = wrapper.clientHeight;

  // ── background
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, W, H);

  // ── line-number gutter
  ctx.fillStyle = '#0b0b17';
  ctx.fillRect(0, 0, CFG.LINENUM_W, H);
  ctx.strokeStyle = '#181830';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(CFG.LINENUM_W - 0.5, 0);
  ctx.lineTo(CFG.LINENUM_W - 0.5, H);
  ctx.stroke();

  // ── line numbers (only visible range)
  const lines   = text.split('\n');
  const curIdx  = ta.selectionStart || 0;
  const curLine = idxToLC(text, curIdx).line;

  const firstVis = Math.max(0, Math.floor((scrollTop - CFG.PAD_TOP) / CFG.LINE) - 1);
  const lastVis  = Math.min(lines.length - 1,
    Math.ceil((scrollTop + vpH - CFG.PAD_TOP) / CFG.LINE) + 1);

  ctx.font         = `${CFG.FONT - 1}px 'Courier New', Courier, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'right';
  for (let l = firstVis; l <= lastVis; l++) {
    ctx.fillStyle = (l === curLine) ? '#6a8fff' : '#2e2e50';
    ctx.fillText(l + 1, CFG.LINENUM_W - 7, CFG.PAD_TOP + l * CFG.LINE + CFG.LINE * 0.5);
  }
  ctx.textAlign = 'left';

  // ── characters
  ctx.font         = `${CFG.FONT}px 'Courier New', Courier, monospace`;
  ctx.textBaseline = 'middle';

  const animMargin = CFG.MAX_AMP * 2 + 60;

  for (const p of particles) {
    // Cull truly invisible
    const vy = p.y + CFG.LINE * 0.5;
    if (vy < scrollTop - animMargin || vy > scrollTop + vpH + animMargin) {
      if (!p.drifting) continue;
    }

    ctx.globalAlpha = p.opacity;

    // Subtle "snap-back glow" when a drifted char returns
    if (!p.drifting && p.blend > 0.05) {
      ctx.shadowColor = p.driftColor;
      ctx.shadowBlur  = p.blend * 10;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = p.color;
    ctx.fillText(p.ch, p.x, p.y + CFG.LINE * 0.5);
  }

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;

  // ── cursor
  const cp    = cursorPx(text, curIdx);
  const blink = 0.5 + 0.5 * Math.sin(blinkT);

  // aura
  const grad = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, CFG.CURSOR_R);
  grad.addColorStop(0, `rgba(106,143,255,${0.20 * blink})`);
  grad.addColorStop(1, 'rgba(106,143,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(cp.x - CFG.CURSOR_R, cp.y - CFG.CURSOR_R, CFG.CURSOR_R*2, CFG.CURSOR_R*2);

  // beam
  ctx.globalAlpha = 0.55 + 0.45 * blink;
  ctx.fillStyle   = '#7a9fff';
  ctx.fillRect(cp.x - 1, cp.y - CFG.LINE * 0.5 + 3, 2, CFG.LINE - 6);
  ctx.globalAlpha = 1;
}

// ─── animation loop ─────────────────────────────────────────
function animate(ts) {
  const dt  = Math.min((ts - lastT) / 1000, 0.016);
  lastT     = ts;
  blinkT   += dt * CFG.BLINK;

  // Refresh cursor pixel coords
  const ci = ta.selectionStart || 0;
  const cp = cursorPx(text, ci);
  curX = cp.x;
  curY = cp.y;

  // Status bar
  const { line, col } = idxToLC(text, ci);
  sbPos.textContent   = `Ln ${line + 1}, Col ${col + 1}`;
  sbChars.textContent = `${text.length} chars`;

  // Per-particle physics — skip particles far outside viewport
  const scrollTop  = wrapper.scrollTop;
  const vpH        = wrapper.clientHeight;
  const animMargin = CFG.MAX_AMP * 2 + 160;
  
  const animTop    = scrollTop - animMargin;
  const animBottom = scrollTop + vpH + animMargin;

  for (const p of particles) {
    if (p.homeY < animTop || p.homeY > animBottom) {
      // Snap to home silently (performance — these chars aren't visible)
      if (!p._atHome) {
        p.x = p.homeX; p.y = p.homeY;
        p.vx = 0;      p.vy = 0;
        p.opacity  = 1;
        p.blend    = 0;
        p.drifting = false;
        p._atHome  = true;
      }
      continue;
    }
    p._atHome = false;
    p.update(curX, curY, dt);
  }

  ensureCursorInViewport();
  render();
  requestAnimationFrame(animate);
}

// ─── input handling ─────────────────────────────────────────
function onInput() {
  if (composing) return;
  const v = ta.value;
  if (v === text) return;

  text      = v;
  placeholder.style.display = text.length ? 'none' : '';
  particles = rebuildParticles(text);
  resizeCanvas();
}

function onKeyDown(e) {
  if (!composing) {
    const selStart = ta.selectionStart || 0;
    const selEnd = ta.selectionEnd || selStart;

    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();

      if (selStart !== selEnd) {
        const { lineStart, lineEnd } = selectionLineRange(text, selStart, selEnd);
        const before = text.slice(0, lineStart);
        const block = text.slice(lineStart, lineEnd);
        const after = text.slice(lineEnd);
        const lines = block.split('\n');

        if (e.shiftKey) {
          const outdented = lines.map((line) => removeUpToLeadingSpaces(line, CFG.TAB));
          const nextBlock = outdented.map((v) => v.line).join('\n');
          const removedFirst = outdented[0] ? outdented[0].removed : 0;
          const removedTotal = outdented.reduce((sum, v) => sum + v.removed, 0);
          const nextText = before + nextBlock + after;
          const nextStart = Math.max(lineStart, selStart - removedFirst);
          const nextEnd = Math.max(nextStart, selEnd - removedTotal);
          applyEditorChange(nextText, nextStart, nextEnd);
        } else {
          const nextBlock = lines.map((line) => INDENT_UNIT + line).join('\n');
          const nextText = before + nextBlock + after;
          const addedFirst = INDENT_UNIT.length;
          const addedTotal = INDENT_UNIT.length * lines.length;
          applyEditorChange(nextText, selStart + addedFirst, selEnd + addedTotal);
        }

        ensureCursorInViewport();
        return;
      }

      if (e.shiftKey) {
        const lineStart = lineStartAt(text, selStart);
        const lineEnd = lineEndAt(text, selStart);
        const lineText = text.slice(lineStart, lineEnd);
        const { removed } = removeUpToLeadingSpaces(lineText, CFG.TAB);
        if (removed > 0) {
          const nextLine = lineText.slice(removed);
          const nextText = text.slice(0, lineStart) + nextLine + text.slice(lineEnd);
          const nextPos = Math.max(lineStart, selStart - removed);
          applyEditorChange(nextText, nextPos);
          ensureCursorInViewport();
        }
      } else {
        const before = text.slice(0, selStart);
        const after = text.slice(selEnd);
        const nextText = before + INDENT_UNIT + after;
        const nextPos = before.length + INDENT_UNIT.length;
        applyEditorChange(nextText, nextPos);
        ensureCursorInViewport();
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      const before = text.slice(0, selStart);
      const after = text.slice(selEnd);

      const lineStart = lineStartAt(text, selStart);
      const lineEnd = lineEndAt(text, selStart);
      const lineText = text.slice(lineStart, lineEnd);
      const lineBeforeCursor = text.slice(lineStart, selStart);
      const prevChar = text[selStart - 1] || '';
      const nextChar = text[selEnd] || '';

      if (selStart === selEnd && BRACKET_PAIRS[prevChar] === nextChar) {
        const baseIndent = Math.floor(leadingSpaceCount(lineText) / CFG.TAB);
        const innerIndent = INDENT_UNIT.repeat(baseIndent + 1);
        const outerIndent = INDENT_UNIT.repeat(baseIndent);
        const insert = '\n' + innerIndent + '\n' + outerIndent;
        const nextText = before + insert + after;
        const nextPos = before.length + 1 + innerIndent.length;
        applyEditorChange(nextText, nextPos);
        ensureCursorInViewport();
        return;
      }

      let indentLevel = Math.floor(leadingSpaceCount(lineText) / CFG.TAB);

      if (/[([{:]\s*$/.test(lineBeforeCursor.trimEnd())) {
        indentLevel++;
      }

      if (nextChar === ')' || nextChar === ']' || nextChar === '}') {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const insert = '\n' + INDENT_UNIT.repeat(indentLevel);
      const nextText = before + insert + after;
      const nextPos = before.length + insert.length;
      applyEditorChange(nextText, nextPos);
      ensureCursorInViewport();
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (BRACKET_PAIRS[e.key]) {
        e.preventDefault();
        const close = BRACKET_PAIRS[e.key];
        const before = text.slice(0, selStart);
        const selected = text.slice(selStart, selEnd);
        const after = text.slice(selEnd);
        const nextText = before + e.key + selected + close + after;
        const nextPos = selStart + 1;
        if (selected.length) {
          applyEditorChange(nextText, nextPos, nextPos + selected.length);
        } else {
          applyEditorChange(nextText, nextPos);
        }
        return;
      }

      if (BRACKET_CLOSERS.has(e.key) && selStart === selEnd && text[selStart] === e.key) {
        e.preventDefault();
        ta.selectionStart = ta.selectionEnd = selStart + 1;
        ensureCursorInViewport();
        return;
      }
    }
  }

  // Cursor may have moved — update on next frame
  requestAnimationFrame(() => {
    const ci = ta.selectionStart || 0;
    const cp = cursorPx(text, ci);
    curX = cp.x; curY = cp.y;
  });
}

ta.addEventListener('input',            onInput);
ta.addEventListener('keydown',          onKeyDown);
ta.addEventListener('compositionstart', () => { composing = true;  });
ta.addEventListener('compositionend',   () => { composing = false; onInput(); });
ta.addEventListener('blur',             () => { requestAnimationFrame(refocusEditorIfNeeded); });

document.addEventListener('pointerdown', (e) => {
  if (!(e.target instanceof Element)) return;
  if (e.target === ta || isExportControl(e.target)) return;
  requestAnimationFrame(refocusEditorIfNeeded);
});

// ─── tap / click to position cursor ────────────────────────
function posToCursorIdx(tapX, tapY) {
  const lines   = text.split('\n');
  const lineIdx = Math.max(0, Math.min(
    lines.length - 1,
    Math.floor((tapY - CFG.PAD_TOP) / CFG.LINE)
  ));

  const lineStr = lines[lineIdx] || '';

  // Expand tabs to find visual column under tap
  let visualCol = 0, charCol = 0;
  for (let i = 0; i < lineStr.length; i++) {
    const nextCol = lineStr[i] === '\t'
      ? Math.ceil((visualCol + 1) / CFG.TAB) * CFG.TAB
      : visualCol + glyphWidth(lineStr[i]);
    const midPx = CFG.PAD_LEFT + (visualCol + (nextCol - visualCol) * 0.5) * charW;
    if (tapX < midPx) break;
    visualCol = nextCol;
    charCol   = i + 1;
  }

  let idx = 0;
  for (let l = 0; l < lineIdx; l++) idx += lines[l].length + 1;
  idx += charCol;
  return Math.max(0, Math.min(text.length, idx));
}

function onPointerDown(e) {
  // Get coords relative to canvas (accounting for scroll)
  const rect   = canvas.getBoundingClientRect();
  const cssW   = parseFloat(canvas.style.width)  || canvas.width;
  const cssH   = parseFloat(canvas.style.height) || canvas.height;
  const scaleX = rect.width  > 0 ? cssW / rect.width  : 1;
  const scaleY = rect.height > 0 ? cssH / rect.height : 1;

  let cx, cy;
  if (e.type === 'touchstart') {
    if (!e.changedTouches.length) return;
    cx = (e.changedTouches[0].clientX - rect.left) * scaleX;
    cy = (e.changedTouches[0].clientY - rect.top)  * scaleY;
  } else {
    cx = (e.clientX - rect.left) * scaleX;
    cy = (e.clientY - rect.top)  * scaleY;
  }

  // Ignore clicks in gutter (just focus)
  if (cx > CFG.LINENUM_W) {
    const idx = posToCursorIdx(cx, cy);
    ta.selectionStart = ta.selectionEnd = idx;
  }

  ta.focus();
  // Reset blink phase so cursor is immediately visible after click
  blinkT = 0;
  ensureCursorInViewport();
}

canvas.addEventListener('mousedown',  onPointerDown);
canvas.addEventListener('touchstart', onPointerDown, { passive: true });

// ─── file export ────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  const fname = (fnInput.value.trim() || 'code') + '.' + extSel.value;
  const blob  = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href     = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ─── window resize ──────────────────────────────────────────
window.addEventListener('resize', () => {
  resizeCanvas();
  // Rebuild home positions (charW may have changed)
  particles = rebuildParticles(text);
});

// ─── visibility change: reset lastT to prevent large dt on resume ───
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastT = performance.now();
});

// ═══════════════════════════════════════════════════════════
// ██  INIT
// ═══════════════════════════════════════════════════════════
(function init() {
  resizeCanvas();
  lastT = performance.now();
  requestAnimationFrame(animate);
  ta.focus();
})();
