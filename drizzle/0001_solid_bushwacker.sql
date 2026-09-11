ALTER TABLE `brand_assets` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brand_assets` ADD `aiNotes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brand_assets` ADD `updatedAt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brands` ADD `instagram` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brands` ADD `linkedin` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brands` ADD `communicationStyle` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brands` ADD `rules` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brands` ADD `creationNotes` text DEFAULT '' NOT NULL;