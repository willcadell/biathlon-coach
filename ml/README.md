# Hole-finding model: experiment code

The plan and the reasoning are in `docs/vision-model-plan.md`. This folder is the code for Stage 0 and Stage 1: measure
the current detector, then train a small network that finds holes on a rectified target and score it against that
detector on the same targets. The results are in `docs/vision-model-plan.md`.

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

3. **Train a first model on the 11 exactly-registered targets.** Its weights (`ml/runs/final-v1.pt`) are used only
   to register the labels of the others, in the next step.

       ml/.venv/bin/python ml/train.py final --name final-v1

4. **Place the labels of the other 33 targets on their photos.** One transform per target, fitted so the labels land on
   the holes the first model finds. Targets where fewer than 7 of 10 labels end up on a detection are not trained on, but
   they are still scored.

       ml/.venv/bin/python ml/register_labels.py

5. **Cross-validate on every target.** Each target is scored, with the app's automatic ring fit and the athlete's
   original labels, by a model that never trained on it. The result is compared with the current detector on the same
   targets.

       ml/.venv/bin/python ml/train.py cv --name cv-v2

6. **Train on everything and save the weights** (for Stage 2, running it in the browser).

       ml/.venv/bin/python ml/train.py final --name final-v2

7. **Export the model for the app.** Writes `public/models/<name>.onnx` and checks it matches PyTorch. The app loads the
   file named in `src/lib/holeModelFiles.ts`; give each new model a new name.

       ml/.venv/bin/python ml/export_onnx.py final-v2 hole-finder-v2
