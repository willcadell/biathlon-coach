# Hole-finding model: experiment code

The plan and the reasoning are in `docs/vision-model-plan.md`. This folder is the code for Stage 0 and Stage 1: measure
the current detector, then train a small network that finds holes on a rectified target and score it against that
detector on the same targets.

Kept out of git (see `.gitignore`): `ml/.venv` (Python environment), `ml/data` (exported images, labels),
`ml/runs` (trained weights), and the photos in `test-images/`. Committed: the code and `ml/results/*.json` (the scored
output of each run).

## Setup, once

    uv venv ml/.venv --python 3.12
    uv pip install --python ml/.venv/bin/python torch numpy pillow

## Steps

1. **Download the contributed targets** (anonymous photo, confirmed shots, calibration, the athlete's confirmed aiming
   circle). Goes through the Supabase CLI against the linked project, because the table has no client access.

       node ml/fetch_contributions.mjs

2. **Export the labelled targets** as rectified images (4 px per mm) with hole positions, a fixed 5-fold split by
   target, and the current detector's result on each target, for a like-for-like comparison.

       npm run ml-export

   Each target is written with the app's *automatic* aiming-circle fit (`auto`, what the app has to work with) and,
   where the contribution kept the athlete's confirmed circle, an *exact* fit too (`exact`). Training uses the exact
   ones, because their labels line up exactly. Scoring uses the automatic ones.

3. **Cross-validate**, scoring each target with a model that never saw it (only targets with an exact fit can be
   trained on, so they are the ones cross-validated):

       ml/.venv/bin/python ml/train.py cv --name cv-v1

4. **Train on all of them and score the rest**, the targets that were never trained on (the developer photos and the
   contributions without an exact fit):

       ml/.venv/bin/python ml/train.py final --name final-v1

The measure matches `test/cv-eval.ts`: a detection is *found* if it is within one bullet diameter of a confirmed shot;
the rest are *missed* and *invented*. "Top-K" keeps only the K strongest peaks, K being the number of shots the bout
should have, which the app knows.
