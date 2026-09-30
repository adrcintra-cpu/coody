-- Feed and Story now represent two layouts of one creative source. Keep the
-- Feed asset as the canonical source for historical records; previous Story
-- files remain in brand_assets and are never deleted.
UPDATE content_versions
SET storyUrl = feedUrl
WHERE feedUrl <> '' AND storyUrl <> '' AND feedUrl <> storyUrl;
--> statement-breakpoint

UPDATE content_versions
SET storyUrl = feedUrl
WHERE feedUrl <> '' AND storyUrl = '';
--> statement-breakpoint

UPDATE content_versions
SET feedUrl = storyUrl
WHERE feedUrl = '' AND storyUrl <> '';
