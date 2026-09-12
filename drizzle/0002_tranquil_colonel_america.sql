ALTER TABLE `content_items` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `special_dates` ADD `brandId` text REFERENCES brands(id);--> statement-breakpoint
ALTER TABLE `special_dates` ADD `isGlobal` integer DEFAULT 0 NOT NULL;