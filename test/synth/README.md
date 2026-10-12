# Synthetic-data experiment: a learned "hole or not" ranker

Question: can synthetic target photos, composited from real hole patches onto a
clean sheet, train a ranker that beats the app's hand-tuned detector on real
photos it has never seen?

## Run it

    npm run cv-synth-library      # HOLDOUT=odd for a fair split (see below)
    npm run cv-synth-generate 300 11
    npm run cv-synth-learn 300

Needs the labelled photos in test-images/ (see test/cv-progress.ts for how they
are downloaded). Outputs go to node_modules/.cache/synth and test-images/synthetic
(both git-ignored).

1. `library.ts` rectifies each labelled photo into the flat target plane (using
   the app's own black-circle fit), aligns them, takes the per-pixel median as a
   clean-sheet **template**, and cuts a **patch** at every confirmed hole as
   "photo minus template", leaving the printed rings and numerals out.
2. `generate.ts` pastes patches onto the template where real shots land
   (real groups, jittered), then adds lighting, blur, noise, a small random
   paper warp, and a tilted phone-style view.
3. `learn.ts` takes the detector's candidates (now exposed with `maxShots`,
   `density`, `onBlack`), builds features (template difference, ring distance,
   axis angle, radial profiles), trains boosted trees, and scores found / extra
   on real held-out photos against the unchanged detector.

## Results (HOLDOUT=odd; contributed = 6 unique targets, eval = 13 held-out)

| trained on | contributed found / extra | eval held-out found / extra |
|---|---|---|
| current detector (baseline) | 16/60 (27%) / 23 | 84/130 (65%) / 46 |
| 300 synthetic + 14 real photos | **21/60 (35%) / 8** | **88/130 (68%) / 33** |
| 300 synthetic only | 21/60 (35%) / 12 | 82/130 (63%) / 36 |
| 14 real photos only | 12/60 (20%) / 1 | 87/130 (67%) / 31 |
| 100 synthetic + 14 real | 15/60 (25%) / 6 | 88/130 (68%) / 31 |
| 30 synthetic + 14 real | 14/60 (23%) / 4 | 89/130 (68%) / 31 |

The candidate list itself contains 62% (contributed) and 90% (eval) of the real
holes, which is the ceiling for any ranking of those candidates.

A logistic regression on the raw pixel patches did not help (contributed 27% to
28%, eval 65% to 59%, more extras): the model, not the data, was the limit.

## Caveats

Tiny test sets (6 + 13 photos, 190 shots), a single sheet design, and
`HOLDOUT=odd` keeps the test photos out of the library but they are from the same
club. Treat these as direction, not proof. Not wired into the app.
