# Meeting Notes — How We Maintain Them

Every client meeting for the Linga Bhairavi Enterprise CRM is recorded, transcribed and turned into a notes file in this folder. Requirements found in meetings are carried into one master list, [../REQUIREMENTS.md](../REQUIREMENTS.md). The aim is that anyone on the team can see **what was said, what was decided, what is still open and who owns it**, without listening to the recording.

## 1. One file per meeting

| Rule | Detail |
|---|---|
| File name | `YYYY-MM-DD-topic.md`, lower-case, hyphenated topic — e.g. `2026-11-20-kickoff-meeting.md`, `2026-12-02-demo-review.md` |
| Location | `docs/meetings/` |
| Transcript | Kept next to the notes and **never edited** (it is the evidence). The kickoff transcript is at [../meeting-transcript.md](../meeting-transcript.md) for historical reasons. |
| Recording | `.mp4` files stay outside git (`*.mp4` is git-ignored). Write the exact recording filename in the notes header. |

### Required sections (copy the structure of [2026-11-20-kickoff-meeting.md](2026-11-20-kickoff-meeting.md))

1. Header table — date/time, attendees (client and Sirah), source recording file name, transcription method, link to transcript, status/version
2. Executive summary (5–10 lines)
3. Business context (only what is new)
4. Pain points — numbered `PP-n`, each with transcript timestamps `[mm:ss]`
5. Requirements captured — `REQ-nnn` with timestamp and proposed MoSCoW priority
6. Decisions — `D-nn`
7. Action items — `A-nn`, owner, due, status (`Open`, `In progress`, `Done`, `Blocked`, `Dropped`)
8. Open questions — `Q-nn`
9. Assumptions, future scope
10. Next meeting agenda
11. Change log / revision history
12. Link to full transcript

### ID rules

- **REQ IDs are global** and never reused. Before adding a new requirement, check the last ID in [../REQUIREMENTS.md](../REQUIREMENTS.md) and continue from there (e.g. the kickoff ended at REQ-030; the BRD adds derived requirements after that).
- PP / D / A / Q IDs are **per meeting**. When referring across meetings use the file date as prefix: `2026-11-20/A-04`.
- A changed requirement keeps its ID; the change is recorded in the REQUIREMENTS change log. A dropped requirement is marked `Dropped`, not deleted.

## 2. Requirements traceability

```
Recording (.mp4) ─► Transcript (.md, unchanged) ─► Meeting notes (REQ/D/A/Q with [mm:ss])
                                                          │
                                                          ▼
                                              docs/REQUIREMENTS.md  (master REQ table,
                                              user stories, business rules, change log)
                                                          │
                                                          ▼
                                     Build backlog ─► Test cases (docs/guides/tester.md) ─► UAT
```

After each meeting the Business Consultant:

1. Adds new `REQ-nnn` rows to the REQ table in `docs/REQUIREMENTS.md` with *Source* = `YYYY-MM-DD [mm:ss]`.
2. Updates *Status* / *Priority* of existing requirements that were discussed.
3. Adds a row to the **Requirements change log** in `docs/REQUIREMENTS.md`.
4. Goes back to earlier meeting files and updates action items/questions that were closed (and adds a line to *their* change log).
5. Tells the Manager which requirements changed, so change control can run (see [../guides/manager.md](../guides/manager.md)).

## 3. Transcribing the next recording

A helper script turns a meeting video into a transcript and a notes skeleton.

**Prerequisites**

- Python 3 on the PATH.
- **ffmpeg** installed and on the PATH (used to extract the audio). Check with `ffmpeg -version`.
- A **Sarvam AI API key** in `.env.local` at the **project root** (`d:\Sirah Digital\AI Automation\Lingam Bhairavi CRM\.env.local`):

  ```
  SARVAM_API_KEY=your-key-here
  ```

  `.env.local` is git-ignored — never commit it or paste the key in chat/notes.

**Run** (from the project root):

```
python -I scripts/transcribe_meeting.py "<video.mp4>" "<topic>"
```

Example:

```
python -I scripts/transcribe_meeting.py "demo-review (2026-12-02 11_00 GMT+5_30).mp4" "demo review"
```

**What it produces**

- A transcript in the same style as the kickoff (English translation with `[mm:ss]` timestamps and the original Tamil/English text below each line).
- A new notes skeleton `docs/meetings/YYYY-MM-DD-<topic>.md` with the section headings above.

The script is maintained separately; check its console output for the exact file paths it wrote. If it fails, confirm ffmpeg is installed, the key is present, and the video path is quoted (file names contain spaces and brackets).

**Then, manually:**

1. Fill in the header (attendees, recording filename).
2. Read the English lines; listen to the recording where the translation is unclear (Tamil technical terms are often mis-translated — e.g. "NPC" for NBC, "VOQ/POQ/BOK" for BOQ, "MB/hp" for NB).
3. Write summary, pain points, REQs, decisions, actions, questions with timestamps.
4. Do the traceability steps in section 2.

## 4. Meeting Notes module in the CRM

The CRM has a **Meeting Notes** module (menu: *Meeting Notes*) where notes can be viewed and edited by authorised users (admin and the team). Use it to:

- record short internal or client calls that were not recorded,
- tick off action items between meetings,
- link a note to a customer or project.

The Markdown files in this folder remain the **formal record for requirements**. If an important decision is captured in the CRM module, copy it into the relevant meeting file and REQUIREMENTS.md at the next update.

## 5. Index of meetings

| Date | Topic | File | Status |
|---|---|---|---|
| 2026-11-20 | Kickoff — requirements | [2026-11-20-kickoff-meeting.md](2026-11-20-kickoff-meeting.md) | v1.0 draft, awaiting client confirmation |
