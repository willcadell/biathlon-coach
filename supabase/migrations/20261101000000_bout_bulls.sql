-- 545-coaching: keep where the aiming circle and the holes were in the photo.
--
-- A scored bout stored only the shots in millimetres, so once saved there was no
-- record of where the aiming circle sat in the photo. That's fine for scoring
-- but it makes a photo a poor training example: to know where each hole is in
-- the picture, the circle had to be found again, and a mis-fit puts the label
-- in the wrong place. This keeps the athlete-confirmed circle fit and hole
-- positions (normalised image coordinates, as the app already holds them while
-- scoring) with the bout. It's the athlete's own data; older bouts have none.

alter table precision_bouts add column bulls jsonb;
