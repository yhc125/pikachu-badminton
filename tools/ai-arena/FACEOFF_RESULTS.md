# Faceoff against both Season 2 leaders

`early-contact` keeps the real-engine rollout and favors earlier contact and ground returns. The fixed opponents are the exact Season 2 policies (including their rollout continuation settings). Each opponent gets four games: both seats, crossed with both first servers. A pass requires at least three wins, no timeouts, and at least one win starting as receiver, separately against each opponent.

| Limit (ticks) | Opponent | Wins | Losses | Timeouts | Wins as receiver | Pass |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 4,800 | `rollout` | 0 | 0 | 4 | 0 | No |
| 4,800 | `s0002-new-01` | 0 | 0 | 4 | 0 | No |
| 12,000 | `rollout` | 3 | 0 | 1 | 1 | No |
| 12,000 | `s0002-new-01` | 1 | 0 | 3 | 1 | No |
| 30,000 | `rollout` | 4 | 0 | 0 | 2 | Yes |
| 30,000 | `s0002-new-01` | 4 | 0 | 0 | 2 | Yes |

At the existing 4,800-tick league limit, all eight matches timed out. Two additional exploratory variants also failed at that limit (16 more timeouts). The 12,000- and 30,000-tick tests are longer diagnostics; they do not change the league rules or replace the champ. The extended run used fresh engine seed values but the opponents and four seat/server combinations are the same, so this is not a generalization claim.

## Finished games at 30,000 ticks

| Opponent | Candidate seat | Starts as | Score | Finish (ticks) |
| --- | ---: | --- | --- | ---: |
| `rollout` | 1P | Server | 11–0 | 10,561 |
| `rollout` | 1P | Receiver | 11–0 | 13,757 |
| `rollout` | 2P | Receiver | 11–3 | 9,622 |
| `rollout` | 2P | Server | 11–0 | 7,272 |
| `s0002-new-01` | 1P | Server | 11–0 | 14,254 |
| `s0002-new-01` | 1P | Receiver | 11–4 | 11,716 |
| `s0002-new-01` | 2P | Receiver | 11–0 | 12,296 |
| `s0002-new-01` | 2P | Server | 11–2 | 12,420 |

## Reproduce

Node v26.5.0. Use a fresh output directory for each run.

```sh
candidate=tools/ai-arena/fixtures/early-contact.json
opponents=tools/ai-arena/fixtures/season-2-leaders.json
node tools/ai-arena/lab.mjs faceoff --left="$candidate" --roster="$opponents" --dir=.ai-lab/faceoff-standard --token=leaders-1 --seed=691337 --max-ticks=4800
node tools/ai-arena/lab.mjs faceoff --left="$candidate" --roster="$opponents" --dir=.ai-lab/faceoff-medium --token=leaders-1 --seed=691337 --max-ticks=12000
node tools/ai-arena/lab.mjs faceoff --left="$candidate" --roster="$opponents" --dir=.ai-lab/faceoff-long --token=leaders-2 --seed=419377 --max-ticks=30000
```
