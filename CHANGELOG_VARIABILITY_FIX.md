# Variability & VarDiff Fixes

## Summary
- Replaced `lib/varDiff.js` with a robust EMA-based implementation:
  - Target share time control, dual retarget (by shares/time), bounded step changes, 2% hysteresis.
  - Correct Ergo difficulty↔target conversion using (2^256 - 1) / difficulty.
  - Emits `newDifficulty` event.
- Fixed delayed retarget application in `lib/pool.js`:
  - On `newDifficulty`, we now **immediately** send a fresh job, ensuring new difficulty takes effect at once.
  - `extranonce1` remains unchanged (per-connection).

## Why this matters
Previously, new difficulty was merely enqueued and waited for a new block/template.
That could leave miners working with stale targets for too long, causing oscillations
and mismatched share validation windows.

## Notes
- `StratumClient.sendMiningJob` already applies pending difficulty in the correct order:
  `mining.set_difficulty` first, then `mining.notify` (fresh job).
- Clean-jobs flag in `BlockTemplate.getJobParams()` stays `true`, which is desirable after a retarget.
