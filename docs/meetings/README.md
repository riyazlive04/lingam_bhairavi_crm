# Meeting Notes: How We Keep Them

We record every client meeting for the Linga Bhairavi Enterprise CRM, transcribe it and turn it into a notes file in this folder. Requirements that come up in meetings go into one master list, [../REQUIREMENTS.md](../REQUIREMENTS.md). The aim is simple: anyone on the team should be able to see **what was said, what was decided, what is still open and who owns it**, without listening to the recording.

## 1. One file per meeting

| Rule | Detail |
|---|---|
| File name | `YYYY-MM-DD-topic.md`, lower-case, with a hyphenated topic. For example `2026-11-20-kickoff-meeting.md` or `2026-12-02-demo-review.md` |
| Location | `docs/meetings/` |
| Transcript | Kept next to the notes and **never edited**, because it is the evidence. The kickoff transcript sits at [../meeting-transcript.md](../meeting-transcript.md) for historical reasons. |
| Recording | `.mp4` files stay out of git (`*.mp4` is git-ignored). Write the exact recording file name in the notes header. |

### Required sections (copy the structure of [2026-11-20-kickoff-meeting.md](2026-11-20-kickoff-meeting.md))

1. Header table: date and time, attendees (client and Sirah Digital), source recording file name, transcription method, link to the transcript, status and version
2. Executive summary (5 to 10 lines)
3. Business context (only what is new)
4. Pain points, numbered `PP-n`, each with transcript timestamps `[mm:ss]`
5. Requirements captured: `REQ-nnn` with a timestamp and a proposed MoSCoW priority
6. Decisions: `D-nn`
7. Action items: `A-nn`, with owner, due date and status (`Open`, `In progress`, `Done`, `Blocked`, `Dropped`)
8. Open questions: `Q-nn`
9. Assumptions and future scope
10. Next meeting agenda
11. Change log (revision history)
12. Link to the full transcript

### ID rules

- **REQ IDs are global** and never reused. Before you add a new requirement, check the last ID in [../REQUIREMENTS.md](../REQUIREMENTS.md) and carry on from there. (The kickoff ended at REQ-030, the BRD added derived requirements up to REQ-044, and the client follow-up of 2026-11-26 added REQ-045 to REQ-058.)
- PP, D, A and Q IDs are **per meeting**. When you refer to one from another meeting, put the file date in front: `2026-11-20/A-04`.
- A changed requirement keeps its ID, and the change goes in the REQUIREMENTS change log. A dropped requirement is marked `Dropped`, not deleted.

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

After each meeting, the Business Consultant:

1. Adds new `REQ-nnn` rows to the REQ table in `docs/REQUIREMENTS.md`, with *Source* = `YYYY-MM-DD [mm:ss]`.
2. Updates the *Status* and *Priority* of existing requirements that were discussed.
3. Adds a row to the **Requirements change log** in `docs/REQUIREMENTS.md`.
4. Goes back to earlier meeting files, updates any action items or questions that are now closed, and adds a line to *their* change log.
5. Tells the Manager which requirements changed, so change control can run (see [../guides/manager.md](../guides/manager.md)).

## 3. Transcribing the next recording

A helper script turns a meeting video into a transcript and a notes outline.

**What you need first**

- Python 3 on the PATH.
- **ffmpeg** installed and on the PATH (it extracts the audio). Check with `ffmpeg -version`.
- A **Sarvam AI API key** in `.env.local` at the **project root** (`d:\Sirah Digital\AI Automation\Lingam Bhairavi CRM\.env.local`):

  ```
  SARVAM_API_KEY=your-key-here
  ```

  `.env.local` is git-ignored. Never commit it, and never paste the key into chat or notes.

**Run it** from the project root:

```
python -I scripts/transcribe_meeting.py "<video.mp4>" "<topic>"
```

Example:

```
python -I scripts/transcribe_meeting.py "demo-review (2026-12-02 11_00 GMT+5_30).mp4" "demo review"
```

**What you get**

- A transcript in the same style as the kickoff: an English translation with `[mm:ss]` timestamps, and the original Tamil/English text below each line.
- A new notes outline, `docs/meetings/YYYY-MM-DD-<topic>.md`, with the section headings listed above.

The script is maintained separately, so check its console output for the exact file paths it wrote. If it fails, make sure ffmpeg is installed, the key is present and the video path is in quotes (the file names contain spaces and brackets).

**Then, by hand:**

1. Fill in the header (attendees and recording file name).
2. Read the English lines. Where the translation is unclear, listen to the recording. Tamil technical terms are often mistranslated, for example "NPC" for NBC, "VOQ/POQ/BOK" for BOQ and "MB/hp" for NB.
3. Write the summary, pain points, REQs, decisions, actions and questions, with timestamps.
4. Do the traceability steps in section 2.

## 4. The Meeting Notes module in the CRM

The CRM has a **Meeting Notes** module (menu: *Meeting Notes*) where authorised users (admin and the team) can view and edit notes. Use it to:

- record short internal or client calls that were not recorded,
- tick off action items between meetings,
- link a note to a customer or project.

The Markdown files in this folder stay the **formal record for requirements**. If an important decision is captured only in the CRM module, copy it into the right meeting file and into REQUIREMENTS.md at the next update.

## 5. Index of meetings

| Date | Topic | File | Status |
|---|---|---|---|
| 2026-11-20 | Kickoff: requirements | [2026-11-20-kickoff-meeting.md](2026-11-20-kickoff-meeting.md) | v1.1 (2026-11-26 follow-up recorded in its change log), awaiting client confirmation |
| 2026-11-28 | Clarification meeting requested by the owner's spouse (planned) | Notes to be added after the meeting | Planned, see kickoff action item A-14 |
