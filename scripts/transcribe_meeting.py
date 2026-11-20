"""
Transcribe a meeting recording with Sarvam AI and create/update meeting notes.

Usage (from the project root):
    python -I scripts/transcribe_meeting.py "<recording.mp4>" "<topic>" [--lang unknown]

Needs: ffmpeg on PATH, SARVAM_API_KEY in .env.local (project root) or the environment.
Produces:
    docs/meetings/<date>-<topic-slug>-transcript.md   full timestamped transcript (English + original language)
    docs/meetings/<date>-<topic-slug>.md              notes skeleton (only if it doesn't exist yet), with the
                                                      open action items carried forward from the previous meeting.
Then fill in the notes (or paste them into the CRM's Meeting Notes module) and update docs/REQUIREMENTS.md.
"""
import concurrent.futures as cf
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEETINGS = os.path.join(ROOT, "docs", "meetings")
CHUNK_SECONDS = 25  # Sarvam synchronous API accepts up to 30 s per request


def api_key():
    k = os.environ.get("SARVAM_API_KEY")
    env = os.path.join(ROOT, ".env.local")
    if not k and os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("SARVAM_API_KEY="):
                k = line.split("=", 1)[1].strip()
    if not k:
        sys.exit("SARVAM_API_KEY not found (set it in .env.local at the project root)")
    return k


def post(key, path, url, fields):
    boundary = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n'
             f"Content-Type: audio/wav\r\n\r\n").encode() + open(path, "rb").read() + f"\r\n--{boundary}--\r\n".encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers={
                "api-subscription-key": key, "Content-Type": f"multipart/form-data; boundary={boundary}"})
            return json.loads(urllib.request.urlopen(req, timeout=120).read())
        except Exception as e:  # retry on rate limits / transient errors
            print(f"  retry {os.path.basename(path)}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    return {}


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "meeting"


def meeting_date(video):
    m = re.search(r"(20\d\d-\d\d-\d\d)", os.path.basename(video))
    return m.group(1) if m else dt.date.today().isoformat()


def previous_open_actions():
    notes = sorted(f for f in glob.glob(os.path.join(MEETINGS, "20*.md")) if not f.endswith("-transcript.md"))
    if not notes:
        return None, []
    last = notes[-1]
    items = [l.rstrip() for l in open(last, encoding="utf-8") if re.match(r"^\s*[-*] \[ \]", l)]
    return os.path.basename(last), items


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    video, topic = sys.argv[1], sys.argv[2]
    lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "unknown"
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found on PATH")
    key = api_key()
    date = meeting_date(video)
    slug = f"{date}-{slugify(topic)}"
    os.makedirs(MEETINGS, exist_ok=True)

    tmp = tempfile.mkdtemp(prefix="lbe-meet-")
    print("Extracting audio…")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-f", "segment",
                    "-segment_time", str(CHUNK_SECONDS), "-c:a", "pcm_s16le", os.path.join(tmp, "chunk_%04d.wav")], check=True)
    chunks = sorted(glob.glob(os.path.join(tmp, "chunk_*.wav")))
    print(f"Transcribing {len(chunks)} chunks with Sarvam…")

    def work(p):
        en = post(key, p, "https://api.sarvam.ai/speech-to-text-translate", {"model": "saaras:v2.5"})
        orig = post(key, p, "https://api.sarvam.ai/speech-to-text", {"model": "saarika:v2.5", "language_code": lang})
        return p, en, orig

    results = {}
    with cf.ThreadPoolExecutor(4) as ex:
        for p, en, orig in ex.map(work, chunks):
            results[p] = (en, orig)

    out = [f"# Transcript — {topic} ({date})", "",
           f"Source: `{os.path.basename(video)}` · Transcribed with Sarvam AI (saaras:v2.5 → English, saarika:v2.5 original) "
           f"in {CHUNK_SECONDS}s segments on {dt.date.today().isoformat()}.", ""]
    for i, p in enumerate(chunks):
        en, orig = results[p]
        s = i * CHUNK_SECONDS
        out.append(f"**[{s // 60:02d}:{s % 60:02d}]** EN: {en.get('transcript', '')}\n")
        if orig.get("transcript"):
            out.append(f"> Original ({orig.get('language_code', '?')}): {orig.get('transcript')}\n")
    tpath = os.path.join(MEETINGS, f"{slug}-transcript.md")
    open(tpath, "w", encoding="utf-8").write("\n".join(out))
    shutil.rmtree(tmp, ignore_errors=True)
    print("Transcript:", tpath)

    npath = os.path.join(MEETINGS, f"{slug}.md")
    if not os.path.exists(npath):
        prev, carried = previous_open_actions()
        carried_md = "\n".join(carried) if carried else "- [ ] _none_"
        open(npath, "w", encoding="utf-8").write(f"""# {topic} — Meeting Notes

| | |
|---|---|
| Date | {date} |
| Attendees | _fill in_ |
| Recording | `{os.path.basename(video)}` |
| Transcript | [{slug}-transcript.md]({slug}-transcript.md) |
| Previous meeting | {prev or '—'} |

## Executive summary
_fill in from the transcript_

## Requirements added / changed
| REQ ID | Change | Timestamp |
|---|---|---|

## Decisions

## Action items
### Carried forward from {prev or 'previous meeting'}
{carried_md}

### New
- [ ]

## Open questions

## Revision history
| Version | Date | Change | By |
|---|---|---|---|
| 1 | {dt.date.today().isoformat()} | Skeleton generated from recording | transcribe_meeting.py |
""")
        print("Notes skeleton:", npath)
    else:
        print("Notes already exist (not overwritten):", npath)


if __name__ == "__main__":
    main()
