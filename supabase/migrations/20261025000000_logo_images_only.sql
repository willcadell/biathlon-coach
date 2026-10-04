-- 545-coaching: the club-logos bucket takes images only.
--
-- The bucket is public, so whatever is uploaded is served from the project's
-- storage domain. The app only ever sends a small resized JPEG, but the storage
-- policy alone let a club admin put any file there (including an SVG, which can
-- carry script). Now the bucket itself refuses anything that isn't a plain
-- raster image, and anything large; SVG and GIF are deliberately not allowed.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit = 1048576 -- 1 MB; a resized logo is a few tens of KB
where id = 'club-logos';
