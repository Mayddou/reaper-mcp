---
type: process-lesson
seen_count: 1
status: active
expires: 2027-01-12
trigger: [analysis, lufs, critique, reaper-mcp, metering]
---
What happened: During a read-only /critique, `measure_tracks` / `read_track_lufs`
overwrote parameter #1 of real user plugins with `trackIndex/127` on every track
measured (MCompressor output gain → -19..-24 dB, Kontakt "Snare" → -51.5 dB,
LA-2A Gain → Min, Ozone Input L → -142 dB, ReaTune Wet → 0). Meters then showed
folder buses ~20 dB below their children — an artifact of the damage, nearly
reported as a mix flaw. No snapshot existed because critique is "read-only".
Why: reaper-mcp bridge bug (mcp_bridge.lua ~1682: `TrackFX_SetParam(track, fx_idx,
1, idx/127)` lands on the wrong FX after container insertion; slot should be `idx`
on a 0–127 slider). Crest/correlation/spectrum JSFX also share one global gmem
(no per-track slot), and `read_track_meters` "RMS" is just peak − 3.01 dB.
Do next time:
- `snapshot_save` BEFORE the first analysis call, even in /critique — analysis
  tools insert FX and can mutate the session.
- Do not call LUFS tools until the bridge fix is verified. Before trusting any
  analysis tool, spot-check `get_fx_parameters` param 1 of one plugin before/after.
- Trust crest/correlation only for the FIRST track metered in a session; treat
  meter "RMS" as fake. A bus reading far below its own children = suspect the tool
  first, the mix second.
Promotion target: critique skill → Rules (snapshot before analysis)

Restore recipe (worked 2026-10-14, user had unsaved work so no revert):
- Originals live in the last saved .RPP: base64 chunk per FX. Decode, then:
  Melda (MCompressor): zlib at byte 84, key/value list storing ONLY non-default
  values (missing key = default). Out gain: dB = -24 + 48·n.
  UADx LA-2A: raw-deflate at 54, UBJSON `plugin_state_payload`; floats in param
  order (Peak Reduct, Gain, ...). Ozone 11: raw-deflate at 54 → nested zlib → JSON.
  Kolin (AnalogObsession): plain-unit doubles in param order; Input = 40·n².
  JUCE AU (BIAS X): plist `data` holds dummy params (all 0).
  Kontakt: state compressed/opaque — had to infer (snare = kick/toms 0 dB = 0.63).
- `set_multiple_fx_parameters` silently no-ops (updated: 0) — use set_fx_parameter
  per param and read back every value.
