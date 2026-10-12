// Stick Duel çok oyunculu sunucu — bağımlılık yok (Node 18+).
// Çalıştır:  node server.js        (PORT ortam değişkeni, varsayılan 8080)
// Kupa verisi DB_FILE (varsayılan data.json) dosyasında tutulur.
const http = require('http'), crypto = require('crypto'), fs = require('fs');
const PORT = process.env.PORT || 8080, DBF = process.env.DB_FILE || 'data.json';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WIN = 25, LOSE = 15; // kupa: kazanana +25, kaybedene -15

let DB = {};
try { DB = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch (e) {}
let st = 0;
const save = () => { clearTimeout(st); st = setTimeout(() => { try { fs.writeFileSync(DBF, JSON.stringify(DB)); } catch (e) {} }, 2000); };

const clean = (s, n) => String(s == null ? '' : s).replace(/[<>&"'`\\]/g, '').slice(0, n);
const int = (v, max) => Math.max(0, Math.min(max, v | 0));
const num = v => (typeof v == 'number' && isFinite(v) ? v : 0);
const top = () => Object.values(DB).sort((a, b) => b.tr - a.tr).slice(0, 10).map(x => ({ n: x.n, tr: x.tr }));

// ---- minimal WebSocket ----
function frame(op, payload) {
  const n = payload.length;
  const h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) :
    (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([h, payload]);
}
const send = (c, o) => { if (!c || c.dead) return; try { c.sock.write(frame(1, Buffer.from(JSON.stringify(o)))); } catch (e) {} };

const rooms = new Map(); // oda kodu -> [client, ...]
let waiting = null;      // herkese açık eşleşme kuyruğu

function pair(a, b, room) {
  const pr = { p: [a, b], room, rep: [null, null], done: 0, t: 0 };
  a.pr = b.pr = pr; a.side = 0; b.side = 1;
  const map = Math.random() * 1000 | 0;
  send(a, { t: 'go', side: 0, map, opp: b.prof });
  send(b, { t: 'go', side: 1, map, opp: a.prof });
}
const mateOf = c => { const pr = c.pr; if (!pr) return null; const m = pr.p[1 - c.side]; return m && !m.dead && m.pr === pr ? m : null; };

function settle(pr) {
  if (pr.done) return; pr.done = 1; clearTimeout(pr.t);
  const rs = pr.rep.filter(x => x != null);
  if (!rs.length || pr.room !== '') return;           // özel odada kupa yok
  if (rs.length == 2 && rs[0] !== rs[1]) return;      // raporlar çelişiyorsa sayma
  const w = rs[0]; if (w !== 0 && w !== 1) return;     // beraberlik
  const win = pr.p[w], lose = pr.p[1 - w];
  if (DB[win.id]) DB[win.id].tr += WIN;
  if (DB[lose.id]) DB[lose.id].tr = Math.max(0, DB[lose.id].tr - LOSE);
  save();
  send(win, { t: 'me', tr: DB[win.id].tr }); send(lose, { t: 'me', tr: DB[lose.id].tr });
}

function onMsg(c, d) {
  if (!d || typeof d != 'object') return;
  if (d.t == 'find') {
    if (c.prof) return;
    c.id = clean(d.id, 40) || 'a' + crypto.randomBytes(6).toString('hex');
    const rec = DB[c.id] || (DB[c.id] = { n: '', tr: int(d.tr, 2000) });
    rec.n = clean(d.n, 12) || 'Oyuncu'; save();
    c.prof = { n: rec.n, c: int(d.c, 50), h: int(d.h, 50), ac: int(d.ac, 500), au: int(d.au, 500), tl: int(d.tl, 500), gl: int(d.gl, 500), kt: int(d.kt, 500), tr: rec.tr };
    send(c, { t: 'me', tr: rec.tr });
    const code = clean(d.r, 6).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code) {
      const a = rooms.get(code) || [];
      if (a.length >= 2) { send(c, { t: 'full' }); return; }
      c.room = code; a.push(c); rooms.set(code, a);
      if (a.length == 2) pair(a[0], a[1], code);
    } else if (waiting && waiting !== c && !waiting.dead && waiting.id !== c.id) {
      const w = waiting; waiting = null; pair(w, c, '');
    } else waiting = c;
    return;
  }
  if (d.t == 'lb') return send(c, { t: 'lb', l: top() });
  const m = mateOf(c);
  if (d.t == 's') {
    if (!m || !d.p || typeof d.p != 'object') return;
    const p = {};
    for (const k of ['x', 'y', 'vx', 'f', 'hp', 'at', 'kind', 'bl', 'hit', 'w', 'g', 'cc', 'cw', 'inv', 'dn', 'gd', 'gb', 'sp']) {
      const v = d.p[k]; if (typeof v == 'number' && isFinite(v) || typeof v == 'boolean') p[k] = v;
    }
    send(m, { t: 's', p });
  } else if (d.t == 'h') {
    if (m) send(m, { t: 'h', d: Math.max(0, Math.min(60, num(d.d))), b: !!d.b, vx: num(d.vx), vy: num(d.vy) });
  } else if (d.t == 'e') {
    if (m) send(m, { t: 'e', v: int(d.v, 5) });
  } else if (d.t == 'rm') {
    if (c.pr && m) { c.pr.rep = [null, null]; c.pr.done = 0; clearTimeout(c.pr.t); send(m, { t: 'rm' }); }
  } else if (d.t == 'res') {
    const pr = c.pr; if (!pr || pr.done) return;
    if (d.w !== 0 && d.w !== 1 && d.w !== -1) return;
    pr.rep[c.side] = d.w;
    if (pr.rep[1 - c.side] != null || !m) settle(pr);
    else { clearTimeout(pr.t); pr.t = setTimeout(() => settle(pr), 6000); }
  }
}

function onClose(c) {
  if (c.dead) return; c.dead = true;
  if (waiting === c) waiting = null;
  if (c.room) { const a = (rooms.get(c.room) || []).filter(x => x !== c); a.length ? rooms.set(c.room, a) : rooms.delete(c.room); }
  const pr = c.pr;
  if (pr) {
    const m = pr.p[1 - c.side];
    if (m && !m.dead && m.pr === pr) { send(m, { t: 'left' }); }
    if (!pr.done && pr.rep.some(x => x != null)) settle(pr);
  }
}

const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/plain' }); r.end('stickduel ok'); });
srv.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() != 'websocket') { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
    crypto.createHash('sha1').update(key + GUID).digest('base64') + '\r\n\r\n');
  sock.setNoDelay(true);
  const c = { sock, dead: false, alive: true, prof: null, pr: null, side: 0, room: '', id: '', n: 0, ts: Date.now() };
  let buf = Buffer.alloc(0), frag = [];
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > 1 << 20) return sock.destroy();
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, fin = buf[0] & 128, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len == 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len == 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20 || !masked) return sock.destroy();
      if (buf.length < off + 4 + len) return;
      const mk = buf.subarray(off, off + 4), pl = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) pl[i] ^= mk[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op == 8) { try { sock.write(frame(8, Buffer.alloc(0))); } catch (e) {} return sock.end(); }
      if (op == 9) { try { sock.write(frame(10, pl)); } catch (e) {} continue; }
      if (op == 10) { c.alive = true; continue; }
      if (op == 1 || op == 0) {
        frag.push(pl);
        if (fin) {
          const txt = Buffer.concat(frag).toString('utf8'); frag = [];
          const now = Date.now(); if (now - c.ts > 1000) { c.ts = now; c.n = 0; }
          if (++c.n > 400) return sock.destroy(); // saniyede en fazla 400 mesaj
          let d; try { d = JSON.parse(txt); } catch (e) { continue; }
          try { onMsg(c, d); } catch (e) { console.error(e); }
        }
      }
    }
  });
  sock.on('close', () => onClose(c));
  sock.on('error', () => { try { sock.destroy(); } catch (e) {} });
  c.ping = setInterval(() => {
    if (!c.alive) return sock.destroy();
    c.alive = false; try { sock.write(frame(9, Buffer.alloc(0))); } catch (e) {}
  }, 25000);
  sock.on('close', () => clearInterval(c.ping));
});

if (require.main === module) srv.listen(PORT, () => console.log('Stick Duel sunucusu :' + PORT));
module.exports = { srv, DB };
