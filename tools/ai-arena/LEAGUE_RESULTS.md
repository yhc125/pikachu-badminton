# Round-robin league: first two seasons

Node v26.5.0, 4 pilots, 2 retained each season. Scores from tick-limit draws do not enter the standings.

```sh
node tools/ai-arena/lab.mjs league --dir=.ai-lab/round-robin --seasons=1 --size=4 --keep=2 --cases=3 --jobs=6 --max-ticks=4800
node tools/ai-arena/lab.mjs league --dir=.ai-lab/round-robin --seasons=1 --jobs=6 --max-ticks=4800
```

## Season 1

24 matches, 16 tick-limit draws.

| Rank | Pilot | Wins | Losses | Draws | Point differential |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | `rollout` | 8 | 0 | 4 | 88 |
| 2 | `baseline` | 0 | 2 | 10 | -22 |
| 2 | `short-serve` | 0 | 2 | 10 | -22 |
| 4 | `deep-serve` | 0 | 4 | 8 | -44 |

Archived: `short-serve`, `deep-serve`.
Queued: `s0002-new-01` (from `rollout`), `s0002-new-02` (from `baseline`).
Separate verification: leader won 8/10; incumbent won 2/10. Direct duel: leader 2 wins, 0 losses, 2 draws. Release champion: `release-baseline`.

## Season 2

24 matches, 16 tick-limit draws.

| Rank | Pilot | Wins | Losses | Draws | Point differential |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | `rollout` | 4 | 0 | 8 | 44 |
| 1 | `s0002-new-01` | 4 | 0 | 8 | 44 |
| 3 | `baseline` | 0 | 4 | 8 | -44 |
| 3 | `s0002-new-02` | 0 | 4 | 8 | -44 |

Archived: `baseline`, `s0002-new-02`.
Queued: `s0003-new-01` (from `rollout`), `s0003-new-02` (from `s0002-new-01`).
Separate verification: leader won 14/14; incumbent won 1/14. Direct duel: leader 2 wins, 0 losses, 2 draws. Release champion: `release-baseline`.

The season-1 retention cutoff was a tie between `baseline` and `short-serve`, so the documented entrant-ID rule retained `baseline`. Season 2 started from the saved lineup; the rollout and its descendant tied for the league lead, while the release champion remained the baseline.
