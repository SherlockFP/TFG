#!/usr/bin/env python3
"""
Minimal itch.io client for FREE / name-your-own-price asset packs.

Never bypasses payment: packs whose minimum price is > 0 are refused.
Only archive / asset file types are downloaded; executables are skipped.

Usage:
  python itch.py probe URL [URL ...]          -> title, price, license row, license snippets, uploads
  python itch.py download URL [--match REGEX] [--exclude REGEX] [--out DIR] [--max-mb N]
  python itch.py list TAG_URL                 -> pack URLs found on an itch.io browse page

Raw files go to tools/raw/<author>__<game>/ by default.
"""
import html
import json
import os
import re
import sys
import time
import argparse
import urllib.parse

import httpx

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "tools", "raw")
ALLOWED_EXT = (".zip", ".7z", ".rar", ".glb", ".gltf", ".fbx", ".obj", ".png", ".jpg",
               ".ogg", ".wav", ".mp3", ".tar", ".gz", ".blend", ".dae", ".pdf", ".txt", ".md")
BLOCKED_EXT = (".exe", ".msi", ".bat", ".cmd", ".apk", ".dmg", ".app", ".sh", ".jar",
               ".scr", ".ps1", ".unitypackage")

_client = None


def client():
    global _client
    if _client is None:
        _client = httpx.Client(headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
                               follow_redirects=True, timeout=60)
    return _client


def polite():
    time.sleep(1.2)


def get(url, **kw):
    polite()
    r = client().get(url, **kw)
    return r


def post(url, data, referer=None, **kw):
    polite()
    h = {"X-Requested-With": "XMLHttpRequest"}
    if referer:
        h["Referer"] = referer
    r = client().post(url, data=data, headers=h, **kw)
    return r


def strip_tags(s):
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</p>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"[ \t]+", " ", s).strip()


def csrf(page):
    m = re.search(r'name="csrf_token" value="([^"]+)"', page)
    return m.group(1) if m else None


def parse_uploads(page):
    """Return list of (upload_id, name, size_text)."""
    out = []
    for m in re.finditer(r'<div class="upload(?:\s[^"]*)?">(.*?)</div>\s*</div>', page, re.S):
        block = m.group(0)
        uid = re.search(r'data-upload_id="(\d+)"', block)
        name = re.search(r'class="name"[^>]*title="([^"]+)"', block) or \
            re.search(r'class="name"[^>]*>([^<]+)<', block)
        size = re.search(r'class="file_size"><span>([^<]+)<', block)
        out.append((uid.group(1) if uid else None,
                    html.unescape(name.group(1)) if name else "?",
                    size.group(1) if size else "?"))
    return out


def game_info(url):
    url = url.rstrip("/")
    info = {"url": url}
    r = get(url + "/data.json")
    if r.status_code == 200:
        try:
            d = r.json()
            info.update(title=d.get("title"), price=d.get("price"),
                        authors=[a.get("name") for a in d.get("authors", [])],
                        tags=d.get("tags", []), id=d.get("id"))
        except Exception:
            pass
    r = get(url)
    page = r.text
    info["page"] = page
    info["status"] = r.status_code
    m = re.search(r"<td>Asset license</td><td>(.*?)</td>", page, re.S)
    info["license_row"] = strip_tags(m.group(1)) if m else None
    m = re.search(r"<td>License</td><td>(.*?)</td>", page, re.S)
    if m and not info["license_row"]:
        info["license_row"] = strip_tags(m.group(1))
    desc = re.search(r'<div class="formatted_description user_formatted">(.*?)</div>', page, re.S)
    text = strip_tags(desc.group(1)) if desc else ""
    info["description"] = text
    snippets = []
    for mm in re.finditer(r"[^\n.]{0,160}(licen[cs]e|CC0|CC-?BY|public domain|credit|attribut|"
                          r"commercial|redistribut|resell)[^\n.]{0,200}", text, re.I):
        s = mm.group(0).strip()
        if s not in snippets:
            snippets.append(s)
    info["license_snippets"] = snippets[:12]
    bm = re.search(r'<span class="buy_message">(.*?)</span></span>', page, re.S) or \
        re.search(r'<span class="buy_message">(.*?)</span>', page, re.S)
    info["buy_message"] = strip_tags(bm.group(1)) if bm else None
    info["direct_uploads"] = parse_uploads(page)
    info["has_direct_download"] = bool(re.search(r'class="button download_btn"', page))
    info["purchase_only"] = bool(re.search(r'/purchase"', page)) and not info["has_direct_download"]
    # minimum price > 0 in any currency: data.json "price" is the minimum ("$0.00" for free /
    # name-your-own-price, "9.00€" / "$4.50" for paid); page markup is the fallback.
    price_num = re.sub(r"[^0-9.]", "", info.get("price") or "")
    paid_json = bool(price_num) and float(price_num or 0) > 0
    bm = (info["buy_message"] or "").lower()
    paid_page = bool(re.search(r'class="dollars original_price"', page)) or (
        bool(re.search(r"[0-9]*[1-9][0-9]*[.,][0-9]{2}|[1-9]", re.sub(r"[^0-9.,]", " ", bm)))
        and "name your own price" not in bm and "or more" in bm)
    info["min_price_positive"] = paid_json or paid_page
    return info


def print_info(info):
    print("=" * 80)
    print(info.get("title"), "|", info["url"])
    print(" authors:", info.get("authors"), " price:", info.get("price"),
          " buy:", info.get("buy_message"), " minprice>0:", info.get("min_price_positive"))
    print(" license row:", info.get("license_row"))
    print(" tags:", ", ".join(info.get("tags") or []))
    for s in info.get("license_snippets", []):
        print("  ~", s[:300])
    for u in info.get("direct_uploads", []):
        print("  file:", u)


def download_page_uploads(url, info):
    """Get uploads (id,name,size) + key via the name-your-own-price download_url flow."""
    page = info["page"]
    tok = csrf(page)
    if info.get("has_direct_download") and all(u[0] for u in info["direct_uploads"]):
        return info["direct_uploads"], None, page
    r = post(url + "/download_url", {"csrf_token": tok}, referer=url)
    try:
        dl = r.json().get("url")
    except Exception:
        dl = None
    if not dl:
        raise RuntimeError("download_url failed: %s %s" % (r.status_code, r.text[:200]))
    key = urllib.parse.unquote(dl.rsplit("/download/", 1)[1])
    r = client().get(dl)
    return parse_uploads(r.text), key, r.text


def fetch_file(url, uid, key, page, dest_dir, name):
    tok = csrf(page)
    # mirrors itch's GameDownload.download_upload(): key only when the page opts carry one
    params = {"source": "game_download", "after_download_lightbox": "1", "as_props": "1"}
    m = re.search(r"GameDownload\('[^']*', (\{.*?\})\)", page)
    if m:
        try:
            opts = json.loads(m.group(1))
            if opts.get("key"):
                params["key"] = opts["key"]
            if not opts.get("show_download_lightbox"):
                params.pop("after_download_lightbox"); params.pop("as_props")
        except Exception:
            pass
    r = post(url + "/file/" + uid + "?" + urllib.parse.urlencode(params), {"csrf_token": tok},
             referer=url)
    try:
        j = r.json()
    except Exception:
        raise RuntimeError("file endpoint non-json %s %s" % (r.status_code, r.text[:200]))
    if "url" not in j:
        raise RuntimeError("file endpoint error: %s" % j)
    os.makedirs(dest_dir, exist_ok=True)
    safe = re.sub(r'[<>:"/\\|?*]', "_", name)
    path = os.path.join(dest_dir, safe)
    with client().stream("GET", j["url"]) as resp:
        resp.raise_for_status()
        with open(path + ".part", "wb") as f:
            for chunk in resp.iter_bytes(1 << 16):
                f.write(chunk)
    # give extensionless uploads a proper extension from magic bytes; refuse executables
    part = path + ".part"
    with open(part, "rb") as f:
        head = f.read(8)
    if head[:2] == b"MZ" or head[:4] == b"\x7fELF":
        os.remove(part)
        raise RuntimeError("refusing executable download: " + name)
    magic_ext = {b"PK\x03\x04": ".zip", b"Rar!": ".rar", b"7z\xbc\xaf": ".7z", b"%PDF": ".pdf",
                 b"glTF": ".glb", b"OggS": ".ogg", b"RIFF": ".wav", b"\x89PNG": ".png"}.get(head[:4])
    if magic_ext and not path.lower().endswith(magic_ext):
        path = path + magic_ext
    os.replace(part, path)
    return path



def size_mb(size_text):
    m = re.match(r"([\d.]+)\s*(kB|KB|MB|GB|B)", size_text or "")
    if not m:
        return None
    v = float(m.group(1))
    return v * {"B": 1e-6, "kB": 1e-3, "KB": 1e-3, "MB": 1, "GB": 1000}[m.group(2)]


def cmd_download(a):
    url = a.url.rstrip("/")
    info = game_info(url)
    print_info(info)
    if info.get("min_price_positive"):
        print("!! pack has a minimum price > 0 -- refusing.")
        return 2
    uploads, key, page = download_page_uploads(url, info)
    author = urllib.parse.urlparse(url).netloc.split(".")[0]
    slug = url.rsplit("/", 1)[1]
    dest = a.out or os.path.join(RAW, f"{author}__{slug}")
    got = []
    for uid, name, size in uploads:
        low = name.lower()
        if not uid:
            continue
        if a.match and not re.search(a.match, name, re.I):
            continue
        if a.exclude and re.search(a.exclude, name, re.I):
            continue
        has_ext = bool(re.search(r"\.[a-z0-9]{2,4}$", low)) and not re.search(r"\(.*\)$", low)
        if low.endswith(BLOCKED_EXT) or (has_ext and not low.endswith(ALLOWED_EXT)):
            print("  skip (type):", name)
            continue
        if not has_ext and not a.match:
            print("  skip (no extension, use --match to take it):", name)
            continue
        mb = size_mb(size)
        if mb is not None and mb > a.max_mb:
            print(f"  skip (size {size}):", name)
            continue
        base = os.path.join(dest, re.sub(r'[<>:"/\\|?*]', "_", name))
        if any(os.path.exists(base + e) for e in ("", ".zip", ".rar", ".7z", ".pdf", ".glb")):
            print("  exists:", name)
            got.append(name)
            continue
        print(f"  downloading {name} ({size}) ...", flush=True)
        # key expires quickly -> refresh download page per file
        if key is not None:
            uploads2, key, page = download_page_uploads(url, info)
        p = fetch_file(url, uid, key, page, dest, name)
        print("   ->", p, os.path.getsize(p))
        got.append(name)
    meta = {k: info.get(k) for k in ("title", "url", "authors", "price", "license_row",
                                      "license_snippets", "tags", "buy_message")}
    meta["files"] = got
    os.makedirs(dest, exist_ok=True)
    with open(os.path.join(dest, "_itch_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    return 0


def cmd_list(a):
    r = get(a.url)
    urls = []
    for m in re.finditer(r'<a[^>]+href="(https://[a-z0-9-]+\.itch\.io/[a-z0-9-]+)"[^>]*class="title game_link"'
                         r'[^>]*>([^<]*)<', r.text):
        if m.group(1) not in [u for u, _ in urls]:
            urls.append((m.group(1), html.unescape(m.group(2))))
    if not urls:
        for m in re.finditer(r'href="(https://[a-z0-9-]+\.itch\.io/[a-z0-9-]+)"', r.text):
            if m.group(1) not in [u for u, _ in urls]:
                urls.append((m.group(1), ""))
    for u, t in urls:
        print(u, "|", t)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("probe")
    p.add_argument("urls", nargs="+")
    p.add_argument("--desc", action="store_true")
    d = sub.add_parser("download")
    d.add_argument("url")
    d.add_argument("--match")
    d.add_argument("--exclude")
    d.add_argument("--out")
    d.add_argument("--max-mb", type=float, default=300)
    l = sub.add_parser("list")
    l.add_argument("url")
    a = ap.parse_args()
    if a.cmd == "probe":
        for u in a.urls:
            try:
                info = game_info(u.rstrip("/"))
                print_info(info)
                if a.desc:
                    print(info["description"][:3000])
            except Exception as e:
                print("ERR", u, e)
        return 0
    if a.cmd == "download":
        return cmd_download(a)
    if a.cmd == "list":
        return cmd_list(a)


if __name__ == "__main__":
    sys.exit(main() or 0)
