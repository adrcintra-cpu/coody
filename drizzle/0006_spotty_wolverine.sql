ALTER TABLE `brands` ADD `avatarUrl` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `content_items` ADD `deletedAt` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text DEFAULT '' NOT NULL;