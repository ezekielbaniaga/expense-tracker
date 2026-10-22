// Builds the animated flow diagrams used in README.md.
//
//   node docs/diagrams/build.mjs
//
// Writes <name>-light.svg and <name>-dark.svg next to this file for every diagram below.
// The SVGs are self-contained (no scripts, no external fonts) because GitHub only shows
// them through <img>, where CSS and SMIL animations play but JavaScript does not.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

// Grid: nodes sit in columns and rows, so the diagrams line up without hand-placed pixels
const W = 190, H = 60, COL_GAP = 44, ROW_GAP = 60, MARGIN = 20;
const colX = (c) => MARGIN + c * (W + COL_GAP);
const rowY = (r) => MARGIN + r * (H + ROW_GAP);

const THEMES = {
  light: {
    node: "#f6f8fa", border: "#d0d7de", text: "#1f2328", muted: "#59636e", pipe: "#e3e7ec",
    flow: "#0969da", db: "#8250df", back: "#1a7f37", fail: "#cf222e",
  },
  dark: {
    node: "#161b22", border: "#30363d", text: "#e6edf3", muted: "#9198a1", pipe: "#262c36",
    flow: "#58a6ff", db: "#bc8cff", back: "#3fb950", fail: "#f85149",
  },
};

// Node kinds: "client" (green border), "db" (cylinder), "decision" (hexagon), "fail" (red),
// default (plain box).
// Edge kinds: "flow" (request path), "db" (to the database), "back" (response), "fail"
// (rejection). Every edge except "fail" carries a packet, in list order, once per cycle.
// Edge bend: "hv" (across, then up or down) or "vh"; without it, an edge from a top or
// bottom side bends in the gap between rows, any other in the gap between columns.
const DIAGRAMS = {
  login: {
    title: "Login flow",
    desc: "POST /auth/login: rate limit, credential check against users, a new session with a "
      + "SHA-256 hashed refresh token in user_sessions, then an access JWT carrying the session id.",
    nodes: {
      client:   { col: 0, row: 0, label: "Client", kind: "client" },
      auth:     { col: 1, row: 0, label: "AuthController", sub: "POST /auth/login" },
      limiter:  { col: 2, row: 0, label: "LoginRateLimiter" },
      tooMany:  { col: 3, row: 0, label: "429 Too Many Requests", sub: "too many attempts", kind: "fail" },
      unauth:   { col: 1, row: 1, label: "401 Unauthorized", sub: "bad credentials", kind: "fail" },
      am:       { col: 2, row: 1, label: "AuthenticationManager", sub: "BCrypt check" },
      uds:      { col: 3, row: 1, label: "DatabaseUserDetailsService" },
      users:    { col: 4, row: 1, label: "users", kind: "db" },
      uss:      { col: 2, row: 2, label: "UserSessionService", sub: "createSession" },
      refresh:  { col: 3, row: 2, label: "Refresh token", sub: "random, SHA-256 hashed" },
      sessions: { col: 4, row: 2, label: "user_sessions", kind: "db" },
      jwt:      { col: 1, row: 3, label: "JWTService", sub: "access JWT, 15 min" },
      resp:     { col: 0, row: 3, label: "LoginResponse", kind: "client" },
    },
    edges: [
      { from: "client.r", to: "auth.l" },
      { from: "auth.r", to: "limiter.l" },
      { from: "limiter.b", to: "am.t", label: "allowed" },
      { from: "am.r", to: "uds.l" },
      { from: "uds.r", to: "users.l", kind: "db" },
      { from: "am.b", to: "uss.t", label: "authenticated" },
      { from: "uss.r", to: "refresh.l" },
      { from: "refresh.r", to: "sessions.l", kind: "db" },
      { from: "uss.b", to: "jwt.t", label: "session id → sid claim" },
      { from: "jwt.l", to: "resp.r" },
      { from: "resp.t", to: "client.b", kind: "back", label: "access + refresh token" },
      { from: "limiter.r", to: "tooMany.l", kind: "fail" },
      { from: "am.l", to: "unauth.r", kind: "fail" },
    ],
  },

  request: {
    title: "Authenticated API request",
    desc: "JWTAuthenticationFilter verifies the Bearer token and builds the user from its claims "
      + "without a database call; a request without a valid token reaches the authorization rules "
      + "unauthenticated and gets 401.",
    nodes: {
      client:  { col: 0, row: 0, label: "Client", kind: "client" },
      filter:  { col: 1, row: 0, label: "JWTAuthenticationFilter", sub: "Authorization header" },
      bearer:  { col: 2, row: 0, label: "Bearer token?", kind: "decision" },
      parse:   { col: 3, row: 0, label: "Valid JWT?", sub: "signature + expiry", kind: "decision" },
      details: { col: 4, row: 0, label: "CustomUserDetails", sub: "from claims, no DB call" },
      context: { col: 4, row: 1, label: "SecurityContext" },
      authz:   { col: 3, row: 1, label: "Authenticated?", sub: "authorization rules", kind: "decision" },
      ctrl:    { col: 2, row: 1, label: "Controller", sub: "@AuthenticationPrincipal" },
      ok:      { col: 1, row: 1, label: "200 OK", kind: "client" },
      unauth:  { col: 3, row: 2, label: "401 Unauthorized", sub: "AuthenticationEntryPoint", kind: "fail" },
    },
    edges: [
      { from: "client.r", to: "filter.l" },
      { from: "filter.r", to: "bearer.l" },
      { from: "bearer.r", to: "parse.l", label: "yes" },
      { from: "parse.r", to: "details.l", label: "yes" },
      { from: "details.b", to: "context.t" },
      { from: "context.l", to: "authz.r" },
      { from: "authz.l", to: "ctrl.r", label: "yes" },
      { from: "ctrl.l", to: "ok.r" },
      { from: "ok.l", to: "client.b", kind: "back", bend: "hv" },
      { from: "bearer.b", to: "authz.t", kind: "fail", label: "no" },
      { from: "parse.b", to: "authz.t", kind: "fail", label: "no" },
      { from: "authz.b", to: "unauth.t", kind: "fail", label: "no" },
    ],
  },

  refresh: {
    title: "Refresh token rotation",
    desc: "POST /auth/refresh: the incoming token's hash must be the session's current one; the "
      + "session gets a new refresh token, the old hash is kept as used, and a replayed used token "
      + "revokes the whole session.",
    nodes: {
      client:   { col: 0, row: 0, label: "Client", kind: "client" },
      auth:     { col: 1, row: 0, label: "AuthController", sub: "POST /auth/refresh" },
      limiter:  { col: 2, row: 0, label: "AuthEndpointRateLimiter" },
      tooMany:  { col: 3, row: 0, label: "429 Too Many Requests", sub: "too many from this IP", kind: "fail" },
      hash:     { col: 2, row: 1, label: "UserSessionService", sub: "SHA-256 of incoming token" },
      current:  { col: 3, row: 1, label: "Current token?", sub: "user_sessions, row locked", kind: "decision" },
      reuse:    { col: 4, row: 1, label: "Used before?", sub: "reuse revokes the session", kind: "fail" },
      checks:   { col: 3, row: 2, label: "Revoked, expired", sub: "or user disabled?", kind: "decision" },
      unauth:   { col: 4, row: 2, label: "401 Unauthorized", kind: "fail" },
      rotate:   { col: 2, row: 2, label: "Rotate", sub: "new token, old hash → used" },
      sessions: { col: 2, row: 3, label: "user_sessions", kind: "db" },
      jwt:      { col: 1, row: 2, label: "JWTService", sub: "new access JWT" },
      resp:     { col: 0, row: 2, label: "LoginResponse", sub: "same session expiry", kind: "client" },
    },
    edges: [
      { from: "client.r", to: "auth.l" },
      { from: "auth.r", to: "limiter.l" },
      { from: "limiter.b", to: "hash.t", label: "allowed" },
      { from: "hash.r", to: "current.l" },
      { from: "current.b", to: "checks.t", label: "yes" },
      { from: "checks.l", to: "rotate.r", label: "no" },
      { from: "rotate.b", to: "sessions.t", kind: "db", label: "same row, new hash" },
      { from: "rotate.l", to: "jwt.r" },
      { from: "jwt.l", to: "resp.r" },
      { from: "resp.t", to: "client.b", kind: "back", label: "access + new refresh token" },
      { from: "limiter.r", to: "tooMany.l", kind: "fail" },
      { from: "current.r", to: "reuse.l", kind: "fail", label: "no" },
      { from: "reuse.b", to: "unauth.t", kind: "fail" },
      { from: "checks.r", to: "unauth.l", kind: "fail", label: "yes" },
    ],
  },

  logout: {
    title: "Logout",
    desc: "POST /auth/logout revokes the session of the given refresh token, current or already "
      + "rotated, and always answers 204; the access token stays valid until it expires.",
    nodes: {
      client:   { col: 0, row: 0, label: "Client", kind: "client" },
      auth:     { col: 1, row: 0, label: "AuthController", sub: "POST /auth/logout" },
      limiter:  { col: 2, row: 0, label: "AuthEndpointRateLimiter" },
      tooMany:  { col: 3, row: 0, label: "429 Too Many Requests", sub: "too many from this IP", kind: "fail" },
      revoke:   { col: 2, row: 1, label: "UserSessionService", sub: "find by current or used hash" },
      sessions: { col: 2, row: 2, label: "user_sessions", kind: "db" },
      done:     { col: 1, row: 1, label: "204 No Content", sub: "access JWT lives on ≤ 15 min", kind: "client" },
    },
    edges: [
      { from: "client.r", to: "auth.l" },
      { from: "auth.r", to: "limiter.l" },
      { from: "limiter.b", to: "revoke.t", label: "allowed" },
      { from: "revoke.b", to: "sessions.t", kind: "db", label: "set revoked_at" },
      { from: "revoke.l", to: "done.r" },
      { from: "done.l", to: "client.b", kind: "back", bend: "hv" },
      { from: "limiter.r", to: "tooMany.l", kind: "fail" },
    ],
  },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "node.side" -> the midpoint of that side of the node's box. */
function anchor(nodes, ref) {
  const [id, side] = ref.split(".");
  const n = nodes[id];
  const x = colX(n.col), y = rowY(n.row);
  return {
    l: [x, y + H / 2], r: [x + W, y + H / 2],
    t: [x + W / 2, y], b: [x + W / 2, y + H],
  }[side];
}

/**
 * Orthogonal route between two anchors: straight when aligned, otherwise
 * out, across the gap between columns or rows, and in.
 */
function route([x1, y1], [x2, y2], vertical) {
  if (x1 === x2 || y1 === y2) return [[x1, y1], [x2, y2]];
  if (vertical) {
    const midY = (y1 + y2) / 2;
    return [[x1, y1], [x1, midY], [x2, midY], [x2, y2]];
  }
  const midX = (x1 + x2) / 2;
  return [[x1, y1], [midX, y1], [midX, y2], [x2, y2]];
}

/** Polyline as a path with rounded corners, so the pipes bend instead of kinking. */
function roundedPath(pts, radius = 14) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const r = Math.min(radius, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const inX = x - Math.sign(x - px) * r, inY = y - Math.sign(y - py) * r;
    const outX = x + Math.sign(nx - x) * r, outY = y + Math.sign(ny - y) * r;
    d += ` L${inX},${inY} Q${x},${y} ${outX},${outY}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L${lx},${ly}`;
}

const pathLength = (pts) =>
  pts.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);

function renderNode(n, t) {
  const x = colX(n.col), y = rowY(n.row), cx = x + W / 2;
  const kind = n.kind ?? "plain";
  const stroke = { client: t.back, db: t.db, fail: t.fail, decision: t.border, plain: t.border }[kind];
  const color = kind === "fail" ? t.fail : t.text;
  let shape;
  let top = y;
  if (kind === "db") {
    const e = 8; // ellipse height of the cylinder's lid
    shape = `<path d="M${x},${y + e} a${W / 2},${e} 0 0 1 ${W},0 V${y + H - e} a${W / 2},${e} 0 0 1 ${-W},0 Z"`
      + ` fill="${t.node}" stroke="${stroke}" stroke-width="1.5"/>`
      + `<path d="M${x},${y + e} a${W / 2},${e} 0 0 0 ${W},0" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
    top += e;
  } else if (kind === "decision") {
    const p = 16; // how far the hexagon's points stick out
    shape = `<path d="M${x + p},${y} H${x + W - p} L${x + W},${y + H / 2} L${x + W - p},${y + H}`
      + ` H${x + p} L${x},${y + H / 2} Z" fill="${t.node}" stroke="${stroke}" stroke-width="1.5"/>`;
  } else {
    shape = `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="10" fill="${t.node}" stroke="${stroke}" stroke-width="1.5"/>`;
  }
  const mid = top + (y + H - top) / 2;
  const text = n.sub
    ? `<text x="${cx}" y="${mid - 8}" class="label" fill="${color}">${esc(n.label)}</text>`
      + `<text x="${cx}" y="${mid + 11}" class="sub" fill="${t.muted}">${esc(n.sub)}</text>`
    : `<text x="${cx}" y="${mid + 1}" class="label" fill="${color}">${esc(n.label)}</text>`;
  return shape + text;
}

function render(diagram, t) {
  const { nodes, edges } = diagram;
  const cols = Math.max(...Object.values(nodes).map((n) => n.col)) + 1;
  const rows = Math.max(...Object.values(nodes).map((n) => n.row)) + 1;
  const width = colX(cols) - COL_GAP + MARGIN;
  const height = rowY(rows) - ROW_GAP + MARGIN;

  const routed = edges.map((e) => {
    const a = anchor(nodes, e.from), b = anchor(nodes, e.to);
    const pts = e.bend === "hv" ? [a, [b[0], a[1]], b]
      : e.bend === "vh" ? [a, [a[0], b[1]], b]
      : route(a, b, /\.[tb]$/.test(e.from));
    return { ...e, kind: e.kind ?? "flow", pts, d: roundedPath(pts), len: pathLength(pts) };
  });

  // Packet timing: each carrying edge gets its own window inside one shared cycle,
  // so all packets stay in step forever without chaining animations.
  const SPEED = 260; // px per second
  const PAUSE = 1.2; // seconds of rest before the cycle repeats
  let clock = 0;
  for (const e of routed) {
    if (e.kind === "fail") continue;
    e.start = clock;
    e.dur = Math.max(0.45, e.len / SPEED);
    clock += e.dur;
  }
  const cycle = clock + PAUSE;
  const k = (s) => (s / cycle).toFixed(4);

  const colorOf = { flow: t.flow, db: t.db, back: t.back, fail: t.fail };
  const pipes = [], flows = [], labels = [], packets = [];
  for (const e of routed) {
    const c = colorOf[e.kind];
    pipes.push(`<path d="${e.d}" class="pipe" stroke="${t.pipe}"/>`);
    flows.push(`<path d="${e.d}" class="flow${e.kind === "fail" ? " fail" : ""}" stroke="${c}"/>`);
    if (e.label) {
      // Beside the first segment: right of a vertical one, above a horizontal one
      const [[x1, y1], [x2, y2]] = e.pts;
      const lbl = x1 === x2
        ? `<text x="${x1 + 10}" y="${(y1 + y2) / 2 + 4}" class="edge beside" fill="${t.muted}">`
        : `<text x="${(x1 + x2) / 2}" y="${y1 - 8}" class="edge" fill="${t.muted}">`;
      labels.push(lbl + esc(e.label) + "</text>");
    }
    if (e.kind !== "fail") {
      const s = k(e.start), f = k(e.start + e.dur);
      packets.push(
        `<circle r="5" fill="${c}" class="packet" opacity="0">`
        + `<animateMotion path="${e.d}" dur="${cycle.toFixed(2)}s" repeatCount="indefinite" calcMode="linear"`
        + ` keyPoints="0;0;1;1" keyTimes="0;${s};${f};1"/>`
        + `<animate attributeName="opacity" dur="${cycle.toFixed(2)}s" repeatCount="indefinite" calcMode="discrete"`
        + ` values="0;1;0" keyTimes="0;${s};${f}"/>`
        + `</circle>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(diagram.title)}</title>
<desc id="desc">${esc(diagram.desc)}</desc>
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; text-anchor: middle; }
  .label { font-size: 13px; font-weight: 600; dominant-baseline: middle; }
  .sub { font-size: 11px; dominant-baseline: middle; }
  .edge { font-size: 11px; }
  .edge.beside { text-anchor: start; }
  .pipe { fill: none; stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; }
  .flow { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 7 11; animation: flow 0.8s linear infinite; }
  .flow.fail { opacity: 0.6; }
  .packet { filter: url(#glow); }
  @keyframes flow { to { stroke-dashoffset: -18; } }
  @media (prefers-reduced-motion: reduce) { .flow { animation: none; } .packet { display: none; } }
</style>
<defs>
  <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur stdDeviation="2.5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<g>${pipes.join("")}</g>
<g>${flows.join("")}</g>
<g>${Object.values(nodes).map((n) => renderNode(n, t)).join("")}</g>
<g>${labels.join("")}</g>
<g>${packets.join("")}</g>
</svg>
`;
}

for (const [name, diagram] of Object.entries(DIAGRAMS)) {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const file = join(OUT_DIR, `${name}-${themeName}.svg`);
    writeFileSync(file, render(diagram, theme));
    console.log(`wrote ${file}`);
  }
}
