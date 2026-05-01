# Adjustment Plan Three: AI-Generated Music Identification

## Overview

Add a two-layer AI identification pipeline to the lamusica system. Each track in the library receives a **confidence score from 1–100**, where **100 means the methodology is certain the song is NOT AI-generated** and **1 means highly likely AI-generated**. The pipeline runs a fast scripted pass first, then routes uncertain tracks to an AI agent for deeper reasoning.

The methodology treats the user's playlist inclusions and play history as non-signals — a song being loved, played, or added to a playlist carries no weight either way.

---

## Reference Materials and Research Findings

### Detection Signal Landscape (2025)

The most reliable detection signals, ranked by reliability:

1. **Year / Release Date** — AI music generators weren't publicly viable before ~2019 (Jukebox, OpenAI) and didn't reach consumer scale until 2022–2023 (Suno, Udio). Pre-2019 release dates are a strong confidence booster.
2. **Purchase / Catalog Provenance** — Tracks marked `purchased = 1` or `kind = 'Purchased AAC audio file'` were acquired through iTunes Store, which requires real artist/label agreements — a meaningful (not absolute) human signal. Apple Music catalog tracks (`apple_music = 1`) carry a softer version of this signal since Apple has AI content policies, but those policies aren't fully enforced retroactively.
3. **Metadata Keywords** — Naively downloaded AI tracks commonly embed generator names in ID3 tags (comments, grouping, album fields): "Suno", "Udio", "Boomy", "AIVA", "Mubert", "Beatoven", "Soundraw", "Sonauto". These are trivially removable but frequently present in practice.
4. **Spectral Upsampling Artifacts** — Deconvolution upsampling layers in neural audio generators produce deterministic periodic peaks in the STFT spectrum (the "checkerboard artifact"). These are architecture-derived, model-specific, and difficult to remove without degrading quality. Accuracy >99% when peaks are detected (arXiv 2506.19108, ISMIR 2025). Requires audio file access and signal processing.
5. **Rhythmic Quantization** — AI-generated music snaps transients to a mathematically perfect grid with no micro-deviation. Human performances — even heavily quantized ones — have subtle timing jitter that differs from AI's mechanical precision.
6. **Phase Entropy / Noise Floor Uniformity** — AI-generated audio has anomalously low phase entropy and a very uniform noise floor, unlike analog recordings or even digitally-recorded live performances.

### Relevant Tools and APIs

| Tool | Type | Applicable Use |
|------|------|----------------|
| **ACRCloud AI Music Detector** | Commercial API | File scanning; covers Suno, Udio, Sonauto, ElevenLabs |
| **Deezer deepfake-detector** | Open source (GitHub: deezer/deepfake-detector) | Research-grade; trained on Suno, Udio, DAC, Encodec |
| **lofcz/ai-music-detector** | Open source (GitHub) | SOTA Suno/Udio detector; open-source implementation |
| **Cyanite.ai** | Commercial API | Music Analysis API with AI detection + tagging |
| **SubmitHub AI Song Checker v2** | Web (no API) | 90%+ accuracy; useful for manual spot-checks |

**Note on SynthID watermarking:** As of April 2025, SynthID-style watermarks can be completely erased by neural audio codec processing (Northwestern/Adobe research). Watermark absence cannot be treated as a confidence booster.

### Known AI Generator Signatures

- **Suno** (v3, v3.5, v4): ID3 comment/XMP fields reference Suno; spectral artifacts in 2–8 kHz band; intentional watermarks (plus incidental architecture artifacts).
- **Udio**: Distinct architecture fingerprint; "upsampling haze" pattern in frequency domain.
- **Boomy**: Symbolic generation (MIDI-sequenced with samples, auto-mixed); lower quality; different artifact profile from diffusion models.
- **AIVA, Mubert, Beatoven, Soundraw**: Primarily used in background/ambient/stock music contexts; often appear with generic or keyword-stuffed album names.

---

## AI Identification Methodology

### Confidence Scale Definition

| Score Range | Interpretation |
|------------|----------------|
| 76–100 | High confidence: NOT AI-generated |
| 51–75 | Moderate confidence: probably NOT AI-generated |
| 26–50 | Low confidence: uncertain, possibly AI-generated |
| 1–25 | High confidence: likely AI-generated |

A score of 50 represents a truly neutral state — no meaningful signal either way.

### Layer 1: Scripted Assessment

The scripted layer evaluates each track using signals derivable from data already in the `tracks` table, without requiring audio file access or external API calls. It is designed to:

- Quickly push clearly pre-AI-era or catalog-verified tracks to high confidence (≥70) so the agent doesn't waste time on them.
- Quickly flag tracks with explicit AI-generator keywords to a low score so they can be reported without agent cost.
- Leave genuinely uncertain tracks in the 40–70 range for agent review.

**Algorithm:**

Start at a neutral score of 50. Apply the following signals additively, then clamp the result to [1, 100].

**Score Boosters (increases confidence → NOT AI)**

| Signal | Condition | Delta |
|--------|-----------|-------|
| Pre-AI era (strong) | `year < 2000` | +40 |
| Pre-AI era (medium) | `2000 ≤ year < 2015` | +30 |
| Pre-consumer AI era | `2015 ≤ year < 2019` | +20 |
| iTunes purchase | `purchased = 1` OR `kind LIKE '%Purchased%'` | +25 |
| iTunes catalog match | `kind LIKE '%Matched%'` | +15 |
| Apple Music catalog | `apple_music = 1` | +10 |
| ALAC file | `kind LIKE '%Apple Lossless%'` | +8 |
| Composer credited | `composer IS NOT NULL AND composer != ''` | +5 |
| Work/movement fields present | `work IS NOT NULL AND work != ''` | +5 |

**Score Penalties (decreases confidence → possibly AI)**

| Signal | Condition | Delta |
|--------|-----------|-------|
| AI generator keyword in name/artist/album/grouping | case-insensitive match: "suno", "udio", "boomy", "aiva", "mubert", "beatoven", "soundraw", "sonauto", "stable audio", "musicgen" | −40 (hard cap to ≤20) |
| Year ≥ 2023 + local unverified file | `year >= 2023` AND `purchased = 0/null` AND `apple_music = 0/null` AND `kind = 'MPEG audio file'` | −15 |
| Year ≥ 2022 + generic MP3 | `year >= 2022` AND `kind = 'MPEG audio file'` AND `purchased = 0/null` | −8 |
| Missing artist AND missing album | `artist IS NULL` AND `album IS NULL` | −10 |
| Very short track + recent | `total_time < 90000` AND `year >= 2022` | −5 |

**Threshold for agent escalation:** If scripted score is < 70, the track is queued for agent assessment. If ≥ 70, the scripted score becomes the final score and agent is skipped.

The `scripted_signals` column stores a JSON array recording each signal that fired, its delta, and the field value that triggered it — enabling the report to explain reasoning transparently.

### Layer 2: Agent Assessment

The agent layer applies to tracks where the scripted score is < 70. An AI agent (Claude claude-opus-4-7 recommended for quality) receives a structured prompt with the track's full metadata plus the scripted signals already found, and is asked to:

1. Research whether the artist is a known human artist with an established discography — or appears to be a pseudonym, generated name, or single-purpose AI account.
2. Look for the track or album in any context that would confirm human authorship (label, ISRC, MusicBrainz records, etc.).
3. Consider the combination of genre, year, kind, and naming patterns in relation to known AI music distribution patterns.
4. Assess whether the track title, album title, or artist name follows templates characteristic of AI generator output (e.g., keyword-stuffed titles, generic ambient names, no individual identity).
5. Note any contradictory evidence (e.g., a recently uploaded artist who has a clear human biography).

**Agent Output Format:**
```json
{
  "score": 72,
  "rationale": "The artist 'Jazz Moods Collective' has no biographical presence, no MusicBrainz records, and the album title follows a template ('Relaxing Jazz for Focus Volume 3') common in AI-generated background music. The 2023 release date and local MP3 format without iTunes purchase flags this as a candidate. However, no explicit generator keywords found and the genre is well-established. Confidence that this is NOT AI-generated: 72/100.",
  "signals": [
    "No verifiable artist identity found online",
    "Album title matches common AI music naming template",
    "2023 release, not purchased through iTunes"
  ]
}
```

**Final Score Rule:**
- If agent ran: `final_score = agent_score`
- If agent did not run (scripted ≥ 70): `final_score = scripted_score`

---

## Information Gathering Process

### Phase 1: Metadata Scan (from existing DB)

All scripted signals can be evaluated directly from the existing `tracks` table. No additional data collection is required.

**Query pattern:** A single pass over all tracks not yet assessed, applying the signal rules and writing results to `ai_assessments`.

### Phase 2: ID3 Tag Enrichment (optional, high-value)

For tracks with a local `location` path (`location IS NOT NULL AND location LIKE 'file://%'`), a separate enrichment script can read ID3 tags using a Node.js library (e.g., `music-metadata`) to extract the `comment` and `lyrics` fields, which Apple Music's plist parser currently does not capture. These fields frequently contain generator attribution text in naively downloaded AI tracks.

- **Trigger:** Run before the scripted assessment pass, writing found comments/lyrics to a new `ai_enrichment` column or dedicated table.
- **Scope:** Only local files — Apple Music streaming tracks have no accessible file.

### Phase 3: Agent Research (Claude API with web search)

For each track queued for agent assessment, the runner calls the Claude API with:
- Full track metadata
- Scripted signals JSON
- System prompt defining the AI identification task
- `web_search` tool enabled so the agent can look up artist information

---

## Database Schema Changes

### New Migration: `005_ai_assessment.ts`

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_assessments', (t) => {
    t.increments('id')
    t.integer('track_id').notNullable().references('id').inTable('tracks').onDelete('CASCADE')

    // Scripted layer
    t.datetime('scripted_assessed_at')
    t.integer('scripted_score')           // 1-100
    t.text('scripted_signals')            // JSON: [{signal, delta, field, value}]
    t.text('scripted_version')            // methodology version string

    // Agent layer
    t.datetime('agent_assessed_at')
    t.integer('agent_score')              // 1-100, null if not assessed
    t.text('agent_rationale')             // free-text reasoning
    t.text('agent_signals')              // JSON: string[]
    t.text('agent_model')                // e.g. "claude-opus-4-7"
    t.text('agent_version')              // methodology version string

    // Final
    t.integer('final_score')             // agent_score if agent ran, else scripted_score
    t.datetime('assessed_at')

    t.unique(['track_id'])
    t.timestamps(true, true)
  })
}
```

### Optional Enrichment Column (if Phase 2 is implemented)

Add a migration to capture ID3-sourced fields not in the current plist schema:

```typescript
// 006_track_enrichment.ts
await knex.schema.table('tracks', (t) => {
  t.text('id3_comment')     // comment tag from audio file
  t.text('id3_lyrics')      // unsynchronized lyrics tag
  t.datetime('enriched_at')
})
```

---

## Implementation Plan

### Step 1: Migration

Create `src/db/migrations/005_ai_assessment.ts` and run `npm run migrate`.

### Step 2: Scripted Assessor

**File:** `src/ai-detection/scriptedAssessor.ts`

Exports a function `assessTrackScripted(track: TrackRow): ScriptedResult` that:
- Evaluates all signal rules against the track row
- Returns `{ score, signals: SignalResult[], version }` where `SignalResult = { signal: string, delta: number, field: string, value: any }`
- Does not read or write the database

Exports a runner `runScriptedAssessment(db: Knex): Promise<ScriptedRunSummary>` that:
- Queries all tracks not yet scripted-assessed (or re-run flag set)
- Calls `assessTrackScripted` for each
- Upserts results to `ai_assessments`
- Returns count of assessed tracks, count below threshold (queued for agent)

### Step 3: Agent Assessor

**File:** `src/ai-detection/agentAssessor.ts`

Exports a function `assessTrackAgent(track: TrackRow, scriptedResult: ScriptedResult): Promise<AgentResult>` that:
- Constructs a structured prompt with track metadata and scripted findings
- Calls the Claude API (`claude-opus-4-7`) with `web_search` tool enabled
- Parses the structured JSON response
- Returns `{ score, rationale, signals, model, version }`

Exports a runner `runAgentAssessment(db: Knex, options: { limit?: number }): Promise<AgentRunSummary>` that:
- Queries all tracks with `scripted_score < 70` and `agent_assessed_at IS NULL`
- Processes them sequentially (respect Claude API rate limits; add configurable concurrency)
- Upserts agent results and final scores to `ai_assessments`
- Returns counts and any errors

### Step 4: Assessment Runner CLI

**File:** `src/ai-detection/runner.ts`

Orchestrates the full pipeline with options:
- `--scripted-only` — skip agent assessment
- `--agent-only` — skip scripted pass (re-use existing scripted results)
- `--re-run` — re-assess already-assessed tracks
- `--limit N` — cap number of agent assessments (cost control)
- `--threshold N` — override scripted-to-agent escalation threshold (default 70)

### Step 5: Report Generator

**File:** `src/reports/aiEvaluationReport.ts`

Generates a markdown report with these sections:

```
# AI Music Evaluation Report
Run: <timestamp>
Assessed: <N> tracks

## Distribution Summary

| Quartile | Range | Count | % of Library |
|----------|-------|-------|--------------|
| Q4 — Likely Not AI    | 76–100 | N | % |
| Q3 — Probably Not AI  | 51–75  | N | % |
| Q2 — Uncertain        | 26–50  | N | % |
| Q1 — Likely AI        | 1–25   | N | % |

## Q4: Likely Not AI (76–100) — 2 Example Songs

[For 2 representative tracks: name, artist, score, key signals that drove the score]

## Q3: Probably Not AI (51–75) — 2 Example Songs

[For 2 representative tracks: name, artist, score, key signals, agent rationale if available]

## Q2: Uncertain / Possibly AI (26–50) — 2 Example Songs

[For 2 representative tracks: name, artist, score, key signals, agent rationale if available]

## Q1: Likely AI (1–25) — All Songs

[For EVERY track in this range:
- Track name, artist, album, year
- Final score
- Scripted signals that fired
- Agent rationale (if agent ran)
- Recommendation: manual review / remove / keep]
```

**Example selection logic:**
- Q4 examples: pick 2 with the most diverse signal profiles (e.g., one pre-2000 purchased track, one recent Apple Music catalog track)
- Q3 examples: pick 2 where the score required agent reasoning to establish
- Q2 examples: pick 2 that illustrate the most common uncertainty pattern

### Step 6: CLI Integration

Add to `scripts/query.ts`:

```
ai-eval run [options]     — run scripted + agent assessment pipeline
ai-eval report            — generate AI evaluation report from latest assessment
ai-eval status            — show assessment coverage (% assessed, distribution preview)
ai-eval reset             — clear all assessments (for full re-run)
```

---

## Report Design Detail

### Q1 Entry Format (All Songs, Full Reasoning)

```markdown
### "Track Name" — Artist Name
**Score:** 12/100  
**Album:** Album Name (2024)  
**Kind:** MPEG audio file  

**Scripted Signals:**
- Year 2024 + local unverified MP3 (−15)
- Missing artist biography pattern (−10)
- No iTunes purchase or Apple Music flag (baseline)

**Agent Assessment:**
"The artist 'Ambient Focus Studio' has no biographical presence on any music platform beyond aggregator-style distribution. The album 'Productivity Music Vol. 7' follows a template used extensively in AI-generated background music catalogs. No MusicBrainz records found. The track title 'Deep Flow State 432hz Binaural' contains frequency/pseudoscience keywords commonly used in AI music SEO. Confidence that this is NOT AI-generated: 12/100."

**Recommendation:** Flag for manual review — strong AI indicators present.
```

---

## Technical Notes

### Version Strings

Both `scripted_version` and `agent_version` should be set to a short string (e.g., `"scripted-v1"`, `"agent-v1"`) so that if the methodology changes, stale assessments can be identified and selectively re-run without a full reset.

### Cost Control

Agent assessment calls the Claude API for each track below the threshold. With 32,000+ tracks in the current library, if even 20% fall below the threshold that is ~6,400 agent calls. Implement:
- `--limit N` flag (default 500 per run) to process in batches
- Prioritization: process Q1 candidates (scripted score < 30) first
- Skip tracks with `agent_assessed_at IS NOT NULL` unless `--re-run` flag set

### Scripted Exclusion Rate

Given the library metadata, the scripted layer should achieve a high exclusion rate. Tracks that are `purchased = 1` or have `year < 2019` are strong candidates for scores ≥ 70. The plan estimates 60–75% of the library may clear the scripted threshold without needing agent review, based on the presence of older and iTunes-purchased content typical in established Apple Music libraries.

### Re-runs and Idempotency

The assessment runner uses `INSERT OR REPLACE` (via Knex upsert on `track_id` unique constraint) so it is safe to re-run. By default it skips already-assessed tracks; `--re-run` overrides this.

### Audio File Analysis (Future Enhancement)

The Deezer `deepfake-detector` and `lofcz/ai-music-detector` open-source tools can be integrated in a Phase 2 enhancement to perform spectral artifact detection on local audio files. This would provide a third, highly reliable layer for tracks with a local `location` path. This is out of scope for the initial implementation but the schema accommodates it via the `scripted_signals` JSON field (additional signal sources can be appended without schema changes).
