# Counting shots without Claude: a trained model that runs on the phone

Status: started 2026-11-15. Stage 1 (feasibility experiment) in progress.

## Why

Shot counting on a precision target has to be free to run and work at a range with no signal. Today:

- The default is a hand-built, non-AI detector that runs in the browser (`blackLocator.ts` finds the aiming
  circle, `holeLocator.ts` finds hole-shaped candidates). It has been the default since 2026-09-18.
- Claude is an opt-in path (the athlete supplies their own key). It costs the app nothing, but it needs a key and
  a connection, and its accuracy has never been measured: nothing stores what it detected next to what the
  athlete confirmed.
- The default detector's measured accuracy, from `npm run cv-progress` and `test/synth/README.md`:

  | set | found | invented |
  |---|---|---|
  | contributed targets (6 unique at the time) | 16/60 (27%) | 23 |
  | developer eval photos (13 held out) | 84/130 (65%) | 46 |

  The athlete corrects every marker before a bout is scored, so a miss costs a tap, but this is the number to beat.

The goal is a **trained hole-finding model that runs in the browser**, improved from the targets athletes choose to
contribute, so that no Claude call, no API key and no per-photo cost is needed.

## Decisions

1. **Inference runs on the device.** It works offline, photos never leave the phone, there is no hosting cost. The
   original roadmap said the same (Stage 4: on-device via ONNX Runtime Web or TensorFlow.js, a hosted endpoint only as
   a fallback if the model proves too heavy for a phone). A server in the scoring path would need a connection and an
   upload for every score.
2. **Training happens off the device, in two steps.**
   - *Now:* on a laptop. With tens of labelled targets, training takes minutes. The model ships as a static file with the
     app, with a version number from the start.
   - *Later, once contributions reach the hundreds:* the same training script moves into a scheduled job that pulls new
     contributions, retrains, tests, and publishes a new model file only if it passes the gate below. The app checks a
     small version file, downloads a newer model once, and the service worker caches it.
3. **The athlete's correction step stays.** A model is a better first guess, never a replacement for checking. Every
   corrected target remains a labelled example.
4. **Claude is retired after the gate is passed**, not before. Until then the optional Claude path stays.

## Timing: the data dries up in race season

Most athletes stop precision shooting until after the race season, so new contributed targets will be few from now
until spring or summer. That shapes the order of work:

- **Build and judge the model on what we have now** (17 unique contributed targets, 28 developer photos). Waiting for
  more data would mean waiting months.
- **Add labelled data by hand where we can.** The developer's other photos in `test-images/` have no confirmed shots yet.
  Scoring them in the app with contributing on turns each into a labelled example, at a few minutes a photo.
- **Have the measuring in place before precision shooting returns.** The next precision season is when real-use data
  arrives, so it should arrive already measured: each contribution should carry the detector's guess next to the
  athlete's corrected shots (Stage 4 below, which works for the current detector too, not only a new model). That
  costs a migration and a small app change, so it belongs in the off-season, not after the season has started.
- **Do not promise the automated retraining loop (Stage 6) before there is data to run it on.** It is for next year.

## Approach

The model reads a **rectified view of the target**: the photo is warped into the flat target plane using the aiming-circle
fit the app already computes, at a fixed scale (4 px per mm; see `test/synth/common.ts`). A hole is then about 22 px
across wherever the photo was taken from, and labels are exact pixel positions. The model is a small fully
convolutional network that outputs a heatmap of hole centres; peaks above a threshold are the holes. The result converts
back to millimetres from the aiming centre, which is the unit the app scores in.

The labelled data is small, so training leans on:

- rotation by any angle and mirror flips (a target is circular), brightness, contrast, blur and noise;
- small random shifts and scale changes of the rectification, to survive an imperfect aiming-circle fit;
- the synthetic sheets from `test/synth/` (real hole patches composited onto a clean-sheet template).

## How we judge it

The measure is the existing one (`test/cv-eval.ts`): a detection counts as *found* if it is within one bullet diameter of
a confirmed shot; the rest are *missed* and *invented*. With so few targets, a single held-out split is noisy, so the
experiment uses **5-fold cross-validation by target**: every target is scored by a model that never saw it, and the same
targets are scored by the current detector for a like-for-like comparison. The folds are fixed in a manifest, and the
numbers are reported for the contributed targets and the developer photos separately.

**Gate to ship** (proposed, revisit with the first real numbers): out-of-fold, at least 85% of confirmed holes found
with about one invented marker per target or fewer, clearly ahead of the current detector on both sets. If a model does
not clear it, we do not ship it; we keep the current detector and keep collecting data.

## Stages

| stage | what | exit |
|---|---|---|
| 0 | Measure the current detector on every labelled target (the baseline) | numbers recorded, fixed folds |
| 1 | Feasibility: a small heatmap model, cross-validated against the baseline | go / no-go against the gate |
| 2 | Port rectification and inference to the browser (lazy-loaded, cached by the service worker) | same answers in the browser as in training; model size and speed on a phone |
| 3 | Ship it as the default; keep the athlete correction; version the model file | field use |
| 4 | Contributions also record which detector or model version guessed and what it guessed, so accuracy in real use is measured. Do this before precision shooting returns, even if the new model has not shipped | a number from real use, for every version |
| 5 | Remove the Claude call, the API key setting and the Anthropic library | smaller app, no key needed |
| 6 | Automate retraining as a scheduled job with the gate, once contributions are numerous | no manual retrains |

## Risks

- **Not enough data.** 17 unique contributed targets and 28 developer photos is about 450 labelled holes. The experiment
  exists to find out cheaply whether that is enough, before the app changes.
- **One sheet design and one club.** The photos come from few cameras and one printed sheet. Treat results as direction,
  and keep collecting from more athletes and sheets.
- **Preprocessing drift.** The browser must rectify and normalise exactly as the training code does. The model file and
  the preprocessing are versioned together.
- **Model size.** The model needs to be a few MB at most to load quickly on a phone. A hosted endpoint stays the
  fallback only if it cannot be.
- **Privacy.** Contributions are opt-in and anonymous (no account, bout or timestamp, only the month). Training uses
  only those. See `README.md`, "Contributes targets anonymously".

## Results so far (Stage 1, 2026-11-15)

Model: a small fully convolutional network (about 250k parameters, under 1 MB), trained for 1,200 to 1,500 steps (a few
minutes on a laptop GPU). Scored with the **automatic** ring fit and the athletes' **original labels**, as the app would
meet them, with a threshold of 0.5 fixed before scoring. Detections outside the outermost scoring ring (handwriting, the
score table in the margin) are discarded. Code and per-target results: `ml/`.

**Round 2: all 44 targets, 5-fold cross-validation.** Every target is scored by a model that never trained on it.
Training used the 11 targets with the athlete's confirmed ring and 27 more whose labels were placed on the photo by
`ml/register_labels.py` (6 more could not be placed and are scored but not trained on).

| | targets | model found | model invented | baseline found | baseline invented |
|---|---|---|---|---|---|
| all targets | 44 | 369/440 (84%) | 42 (1.0 per target) | 224/440 (51%) | 179 (4.1) |
| developer eval photos | 27 | 227/270 (84%) | 30 | 174/270 (64%) | 92 |
| contributed targets | 17 | 142/170 (84%) | 12 | 50/170 (29%) | 87 |
| the 38 with a trusted registration | 38 | 331/380 (87%) | 27 (0.7) | 203/380 (53%) | 150 |

Keeping only the K strongest peaks, K being the shots the bout should have (the app knows it), brings the invented
count on all 44 to 32 (0.7 per target) with no loss in found. Position error on a found hole is about 1.2 mm, against
1.6 mm for the baseline.

**Round 1: 11 targets trained on, 33 never seen** (an earlier, smaller run): 83% found against 58% for the baseline, with
3.7 invented per target before the ring limit and the extra training data. A second seed gave the same answer
(273/330 found), so it was not a lucky run.

**Against the proposed gate** (at least 85% found, about one invented per target): 84% found and 1.0 invented per target
on all 44, 87% and 0.7 on the 38 with a trusted registration. It is one point short on the full set and level on the
rest.

**What was learned on the way.**
- A first attempt at registering the other 33 targets by aligning them to the printed rings failed its own check (it made 5
  of the 11 known cases worse, because the printed rings do not fix the frame of the athlete's confirmed circle) and was
  dropped. Registering the labels with a model's detections, one transform per target and never one label at a time,
  worked: 197 of 330 labels sat on a detection before, 262 after, and the shifts were small (mostly under 1.5 mm).
- The old detector's "registration" misses were mostly its own detection mistakes, not a wrong ring fit: the per-target
  fits were within a few millimetres.
- Several remaining "misses" are label noise: the labels sit a few millimetres off a hole the model found, because the
  labels came from a slightly different perspective fit than the automatic one. That counts against the model and the
  baseline alike.
- The drop from 3.7 to 1.0 invented per target came from two changes made together (more training data, and discarding
  detections outside the outermost ring). They have not been separated.

**Read this carefully.**
- It is promising and not yet proven. The most likely thing to go wrong is a different athlete: the 44 targets are, as far
  as I can tell, all one athlete's (44 scored bouts, all with photos, match the 44 unique labelled targets), on one phone,
  one printed sheet and one range. Another phone, light or sheet is untested. Contributions from more athletes are the fix.
- One run of round 2 (one seed), one threshold, nothing tuned on the test targets. Round 1's two seeds agreed closely.
- The 27 targets registered with a model's help are scored here with their original labels, so that step cannot flatter the
  headline numbers; the separate "detection only" figure (88% found) does lean on it slightly and is not used as the
  headline.

## Running it

Training code lives in `ml/` (see `ml/README.md`). Its Python environment, the downloaded photos and the trained
weights stay out of git; the plan, the code and the result summaries are committed.
