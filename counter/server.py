#!/usr/bin/env python3
"""Visit counter + IP-source statistics for 无限背景音乐 / Infinite BGM.

Standard library only — no dependencies, no database. Two files under DATA_DIR:

  hits.jsonl    append-only log, one JSON object per page view (raw IP, the
                Cloudflare geo headers, UA, referrer, screen, timezone)
  counters.json aggregates: totals, per-day views, unique visitors keyed by a
                salted IP hash, plus country / city / ASN tallies

Endpoints
  POST /api/hit    record a page view, reply {views, visitors, today}
  GET  /api/count  same numbers without recording
  GET  /stats      human-readable report, requires ?token=<BGM_STATS_TOKEN>
  GET  /healthz    200 OK

The site itself is a static bundle: if this service is down the app simply
hides the counter and keeps working.
"""

import hashlib
import json
import os
import threading
import time
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DATA_DIR = os.environ.get("BGM_DATA_DIR", "/data")
HITS_PATH = os.path.join(DATA_DIR, "hits.jsonl")
COUNTERS_PATH = os.path.join(DATA_DIR, "counters.json")
STATS_TOKEN = os.environ.get("BGM_STATS_TOKEN", "")
IP_SALT = os.environ.get("BGM_IP_SALT", "bgm")
PORT = int(os.environ.get("BGM_PORT", "8080"))
TZ_OFFSET = int(os.environ.get("BGM_TZ_OFFSET", "8"))  # CST
# Keep the raw log bounded (roughly a year of casual traffic).
MAX_HITS = 200_000

_lock = threading.Lock()
_records_seen = 0


def _empty_counters():
    return {
        "views": 0,
        "visitors": {},
        "days": {},
        "countries": {},
        "cities": {},
        "asns": {},
        "first": None,
        "last": None,
    }


def today_key():
    return (datetime.now(timezone.utc) + timedelta(hours=TZ_OFFSET)).strftime("%Y-%m-%d")


def load_counters():
    try:
        with open(COUNTERS_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("bad shape")
        base = _empty_counters()
        base.update(data)
        return base
    except Exception:
        return _empty_counters()


def save_counters(counters):
    tmp = COUNTERS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(counters, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, COUNTERS_PATH)


def trim_hits():
    """Keep the append-only log from growing without bound."""
    global _records_seen
    try:
        if os.path.getsize(HITS_PATH) < 8 * 1024 * 1024:
            return
        with open(HITS_PATH, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
        if len(lines) <= MAX_HITS:
            return
        with open(HITS_PATH, "w", encoding="utf-8") as fh:
            fh.writelines(lines[-MAX_HITS:])
        print(f"[counter] trimmed hits log to {MAX_HITS} records")
    except FileNotFoundError:
        return
    except Exception as exc:  # never let maintenance break the service
        print(f"[counter] trim failed: {exc}")


def replay_log(counters):
    """Rebuild aggregates from hits.jsonl when counters.json is missing."""
    try:
        with open(HITS_PATH, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    apply_hit(counters, json.loads(line))
                except Exception:
                    continue
    except FileNotFoundError:
        pass
    return counters


def apply_hit(counters, hit):
    """Pure aggregate update — used both live and when rebuilding from the log."""
    ip_hash = hit.get("ip_hash") or ""
    counters["views"] = int(counters.get("views", 0)) + 1
    day = hit.get("day") or today_key()
    counters.setdefault("days", {})[day] = int(counters.get("days", {}).get(day, 0)) + 1
    if ip_hash:
        visitors = counters.setdefault("visitors", {})
        entry = visitors.get(ip_hash)
        if entry is None:
            visitors[ip_hash] = {
                "ip": hit.get("ip", ""),
                "country": hit.get("country", ""),
                "city": hit.get("city", ""),
                "asn": hit.get("asn", ""),
                "first": hit.get("ts"),
                "last": hit.get("ts"),
                "views": 1,
            }
        else:
            entry["views"] = int(entry.get("views", 0)) + 1
            entry["last"] = hit.get("ts")
            for field in ("ip", "country", "city", "asn"):
                if not entry.get(field) and hit.get(field):
                    entry[field] = hit[field]
    country = hit.get("country") or "??"
    counters.setdefault("countries", {})[country] = counters["countries"].get(country, 0) + 1
    city = hit.get("city") or ""
    if city:
        counters.setdefault("cities", {})[city] = counters["cities"].get(city, 0) + 1
    asn = hit.get("asn") or ""
    if asn:
        counters.setdefault("asns", {})[asn] = counters["asns"].get(asn, 0) + 1
    if not counters.get("first"):
        counters["first"] = hit.get("ts")
    counters["last"] = hit.get("ts")
    return counters


def ip_hash(ip):
    return hashlib.sha256((IP_SALT + "|" + ip).encode("utf-8")).hexdigest()[:16]


class Handler(BaseHTTPRequestHandler):
    server_version = "bgm-counter/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[counter] " + (fmt % args))

    # -- helpers ----------------------------------------------------------
    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html, status=200):
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def client_ip(self):
        # Cloudflare sets this; fall back to the socket peer for direct hits.
        ip = self.headers.get("CF-Connecting-IP") or ""
        if not ip:
            fwd = self.headers.get("X-Forwarded-For") or ""
            ip = fwd.split(",")[0].strip()
        if not ip:
            ip = self.client_address[0]
        return ip.strip()

    def geo(self):
        return {
            "country": (self.headers.get("CF-IPCountry") or "").strip(),
            "city": (self.headers.get("CF-IPCity") or "").strip(),
            "region": (self.headers.get("CF-Region") or "").strip(),
            "continent": (self.headers.get("CF-IPContinent") or "").strip(),
            "asn": (self.headers.get("CF-ASN") or "").strip(),
        }

    def summary(self, counters):
        return {
            "views": int(counters.get("views", 0)),
            "visitors": len(counters.get("visitors", {})),
            "today": int(counters.get("days", {}).get(today_key(), 0)),
        }

    # -- routes -----------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/healthz":
            return self.send_json({"ok": True})
        if path == "/api/count":
            with _lock:
                counters = load_counters()
            return self.send_json(self.summary(counters))
        if path == "/stats":
            return self.stats_page()
        return self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/hit":
            return self.send_json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        payload = {}
        if 0 < length <= 4096:
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8", "replace"))
                if not isinstance(payload, dict):
                    payload = {}
            except Exception:
                payload = {}
        ip = self.client_ip()
        geo = self.geo()
        hit = {
            "ts": int(time.time()),
            "day": today_key(),
            "ip": ip,
            "ip_hash": ip_hash(ip),
            "country": geo["country"],
            "city": geo["city"],
            "region": geo["region"],
            "continent": geo["continent"],
            "asn": geo["asn"],
            "ua": (self.headers.get("User-Agent") or "")[:200],
            "ref": (self.headers.get("Referer") or "")[:200],
            "lang": str(payload.get("lang", ""))[:8],
            "theme": str(payload.get("theme", ""))[:8],
            "screen": str(payload.get("screen", ""))[:16],
            "tz": str(payload.get("tz", ""))[:48],
            "path": str(payload.get("path", "/"))[:120],
        }
        with _lock:
            counters = load_counters()
            apply_hit(counters, hit)
            save_counters(counters)
            try:
                with open(HITS_PATH, "a", encoding="utf-8") as fh:
                    print(json.dumps(hit, ensure_ascii=False), file=fh)
            except Exception as exc:
                print(f"[counter] hit log append failed: {exc}")
        return self.send_json(self.summary(counters))

    # -- report -----------------------------------------------------------
    def stats_page(self):
        token = (parse_qs(urlparse(self.path).query).get("token") or [""])[0]
        if not STATS_TOKEN or token != STATS_TOKEN:
            return self.send_html(_LOGIN_HTML.replace("__ERR__", ""), 401)
        with _lock:
            counters = load_counters()
        hits = []
        try:
            with open(HITS_PATH, "r", encoding="utf-8", errors="replace") as fh:
                lines = fh.readlines()[-120:]
            for line in reversed(lines):
                line = line.strip()
                if line:
                    hits.append(json.loads(line))
        except FileNotFoundError:
            pass
        except Exception as exc:
            print(f"[counter] read log failed: {exc}")
        return self.send_html(render_stats(counters, hits, today_key()), 200)


def _fmt_ts(ts):
    if not ts:
        return "-"
    return (datetime.fromtimestamp(int(ts), timezone.utc) + timedelta(hours=TZ_OFFSET)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def _rows(mapping, limit=25):
    items = sorted(mapping.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    if not items:
        return '<tr><td colspan="2" class="dim">暂无数据</td></tr>'
    total = sum(mapping.values()) or 1
    out = []
    for key, value in items:
        pct = value / total * 100
        out.append(
            f"<tr><td>{_esc(key)}</td><td class='num'>{value}</td><td class='num dim'>{pct:.1f}%</td></tr>"
        )
    return "".join(out)


def _esc(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_stats(counters, hits, today):
    visitors = counters.get("visitors", {})
    top_visitors = sorted(visitors.values(), key=lambda v: int(v.get("views", 0)), reverse=True)
    visitor_rows = []
    for v in top_visitors[:40]:
        visitor_rows.append(
            "<tr>"
            f"<td class='mono'>{_esc(v.get('ip', ''))}</td>"
            f"<td>{_esc(v.get('country', ''))} {_esc(v.get('city', ''))}</td>"
            f"<td class='mono dim'>{_esc(v.get('asn', ''))}</td>"
            f"<td class='num'>{int(v.get('views', 0))}</td>"
            f"<td class='dim'>{_fmt_ts(v.get('first'))}</td>"
            f"<td class='dim'>{_fmt_ts(v.get('last'))}</td>"
            "</tr>"
        )
    hit_rows = []
    for h in hits:
        hit_rows.append(
            "<tr>"
            f"<td class='dim'>{_fmt_ts(h.get('ts'))}</td>"
            f"<td class='mono'>{_esc(h.get('ip', ''))}</td>"
            f"<td>{_esc(h.get('country', ''))} {_esc(h.get('city', ''))}</td>"
            f"<td>{_esc(h.get('lang', ''))}/{_esc(h.get('theme', ''))}</td>"
            f"<td class='dim'>{_esc(h.get('tz', ''))}</td>"
            f"<td class='dim'>{_esc((h.get('ref') or '')[:60])}</td>"
            f"<td class='dim'>{_esc((h.get('ua') or '')[:70])}</td>"
            "</tr>"
        )
    days = counters.get("days", {})
    day_rows = "".join(
        f"<tr><td class='mono'>{_esc(d)}</td><td class='num'>{days[d]}</td></tr>"
        for d in sorted(days, reverse=True)[:30]
    )
    summary = {
        "views": int(counters.get("views", 0)),
        "visitors": len(visitors),
        "today": int(days.get(today, 0)),
        "since": _fmt_ts(counters.get("first")),
        "last": _fmt_ts(counters.get("last")),
    }
    body = _STATS_HTML
    for key, value in (
        ("__VIEWS__", f"{summary['views']:,}"),
        ("__VISITORS__", f"{summary['visitors']:,}"),
        ("__TODAY__", f"{summary['today']:,}"),
        ("__SINCE__", summary["since"]),
        ("__LAST__", summary["last"]),
        ("__DAYS__", day_rows or "<tr><td class='dim'>暂无</td></tr>"),
        ("__COUNTRIES__", _rows(counters.get("countries", {}))),
        ("__CITIES__", _rows(counters.get("cities", {}))),
        ("__ASNS__", _rows(counters.get("asns", {}))),
        ("__VISITORS_TABLE__", "".join(visitor_rows) or "<tr><td colspan='6' class='dim'>暂无</td></tr>"),
        ("__HITS__", "".join(hit_rows) or "<tr><td colspan='7' class='dim'>暂无</td></tr>"),
    ):
        body = body.replace(key, value)
    return body


_LOGIN_HTML = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>访问统计 · 需要令牌</title>
<style>
 body{font-family:system-ui,-apple-system,'PingFang SC',sans-serif;background:#0b0e14;color:#e8ecf3;
      display:grid;place-items:center;min-height:100vh;margin:0}
 form{background:#151a24;border:1px solid #262c3a;border-radius:14px;padding:24px;width:min(90vw,340px)}
 input{width:100%;padding:10px;border-radius:9px;border:1px solid #2b3346;background:#0f131c;color:#e8ecf3;
       font:inherit;margin:10px 0}
 button{width:100%;padding:10px;border:0;border-radius:9px;background:#e8a04c;color:#12161f;font:inherit;
        font-weight:600;cursor:pointer}
 p{color:#8b93a5;font-size:13px;margin:0}
</style></head>
<body><form method="get" action="/stats">
<h3 style="margin-top:0">访问统计</h3>
<p>请输入统计令牌（?token=&lt;token&gt;）</p>
<input name="token" type="password" placeholder="token" autofocus>
<button type="submit">查看</button>
</form></body></html>"""


_STATS_HTML = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>访问统计 · 无限背景音乐</title>
<style>
 body{font-family:system-ui,-apple-system,'PingFang SC',sans-serif;background:#0b0e14;color:#e8ecf3;
      margin:0;padding:22px;line-height:1.55}
 h1{font-size:19px;margin:0 0 4px}
 h2{font-size:14px;margin:26px 0 8px;color:#e8a04c;letter-spacing:.4px}
 .dim{color:#8b93a5}
 .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
 .cards{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}
 .card{background:#151a24;border:1px solid #262c3a;border-radius:13px;padding:12px 16px;min-width:132px}
 .card b{display:block;font-size:23px;font-weight:650}
 .card span{font-size:12px;color:#8b93a5}
 table{border-collapse:collapse;width:100%;font-size:13px}
 th,td{text-align:left;padding:6px 9px;border-bottom:1px solid #1e2431}
 th{color:#8b93a5;font-weight:500;font-size:12px}
 .num{text-align:right;font-variant-numeric:tabular-nums}
 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}
 .scroll{overflow-x:auto}
</style></head><body>
<h1>访问统计 · 无限背景音乐</h1>
<p class="dim">页面访问与 IP 来源统计（Cloudflare 头部）</p>
<div class="cards">
  <div class="card"><b>__VIEWS__</b><span>总访问次数</span></div>
  <div class="card"><b>__VISITORS__</b><span>独立访客（IP 去重）</span></div>
  <div class="card"><b>__TODAY__</b><span>今日访问</span></div>
  <div class="card"><b style="font-size:13px">__SINCE__</b><span>首次记录</span></div>
  <div class="card"><b style="font-size:13px">__LAST__</b><span>最近访问</span></div>
</div>
<div class="grid">
  <div><h2>访问来源国家 / 地区</h2><div class="scroll"><table>
    <tr><th>国家/地区</th><th class="num">次数</th><th class="num">占比</th></tr>__COUNTRIES__</table></div></div>
  <div><h2>城市</h2><div class="scroll"><table>
    <tr><th>城市</th><th class="num">次数</th><th class="num">占比</th></tr>__CITIES__</table></div></div>
  <div><h2>运营商 / ASN</h2><div class="scroll"><table>
    <tr><th>ASN</th><th class="num">次数</th><th class="num">占比</th></tr>__ASNS__</table></div></div>
  <div><h2>按日访问（近 30 天）</h2><div class="scroll"><table>
    <tr><th>日期</th><th class="num">访问</th></tr>__DAYS__</table></div></div>
</div>
<h2>访客明细（按访问次数，前 40）</h2>
<div class="scroll"><table>
  <tr><th>IP</th><th>地区</th><th>ASN</th><th class="num">访问</th><th>首次</th><th>最近</th></tr>
  __VISITORS_TABLE__</table></div>
<h2>最近访问记录（120 条）</h2>
<div class="scroll"><table>
  <tr><th>时间</th><th>IP</th><th>地区</th><th>语言/主题</th><th>时区</th><th>来源</th><th>UA</th></tr>
  __HITS__</table></div>
</body></html>"""


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    global _records_seen
    with _lock:
        counters = load_counters()
        if counters.get("views", 0) == 0 and os.path.exists(HITS_PATH):
            print("[counter] counters missing — rebuilding from hits log")
            counters = replay_log(_empty_counters())
            save_counters(counters)
        _records_seen = int(counters.get("views", 0))
    trim_hits()
    print(f"[counter] listening on 0.0.0.0:{PORT}  data={DATA_DIR}  views={_records_seen}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
