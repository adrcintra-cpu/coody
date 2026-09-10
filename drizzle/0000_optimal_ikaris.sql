CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`action` text NOT NULL,
	`entityId` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`contentId` text NOT NULL,
	`versionId` text NOT NULL,
	`decision` text NOT NULL,
	`createdAt` text NOT NULL,
	`userId` text,
	FOREIGN KEY (`contentId`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`versionId`) REFERENCES `content_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `brand_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`brandId` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`mime` text NOT NULL,
	`url` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`approved` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_brand` ON `brand_assets` (`brandId`);--> statement-breakpoint
CREATE TABLE `brand_guidelines` (
	`id` text PRIMARY KEY NOT NULL,
	`brandId` text NOT NULL,
	`rules` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`segment` text NOT NULL,
	`description` text NOT NULL,
	`website` text NOT NULL,
	`social` text NOT NULL,
	`voice` text NOT NULL,
	`keywords` text NOT NULL,
	`forbidden` text NOT NULL,
	`direction` text NOT NULL,
	`notes` text NOT NULL,
	`colors` text NOT NULL,
	`fonts` text NOT NULL,
	`products` text NOT NULL,
	`services` text NOT NULL,
	`monthlyGoal` integer NOT NULL,
	`weeklyGoal` integer NOT NULL,
	`pillars` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`contentId` text NOT NULL,
	`text` text NOT NULL,
	`createdAt` text NOT NULL,
	`user` text NOT NULL,
	FOREIGN KEY (`contentId`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`brandId` text NOT NULL,
	`title` text NOT NULL,
	`brief` text NOT NULL,
	`objective` text NOT NULL,
	`pillar` text NOT NULL,
	`date` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_content_brand_date` ON `content_items` (`brandId`,`date`);--> statement-breakpoint
CREATE TABLE `content_pillars` (
	`id` text PRIMARY KEY NOT NULL,
	`brandId` text NOT NULL,
	`name` text NOT NULL,
	`percent` integer NOT NULL,
	FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`contentId` text NOT NULL,
	`number` integer NOT NULL,
	`headline` text NOT NULL,
	`copy` text NOT NULL,
	`caption` text NOT NULL,
	`hashtags` text NOT NULL,
	`feedUrl` text NOT NULL,
	`storyUrl` text NOT NULL,
	`change` text NOT NULL,
	`createdAt` text NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`contentId`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_version_content_number` ON `content_versions` (`contentId`,`number`);--> statement-breakpoint
CREATE TABLE `generated_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`versionId` text NOT NULL,
	`format` text NOT NULL,
	`url` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`versionId`) REFERENCES `content_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monthly_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`brandId` text NOT NULL,
	`month` text NOT NULL,
	`monthlyGoal` integer NOT NULL,
	`weeklyGoal` integer NOT NULL,
	`days` text NOT NULL,
	`campaign` text NOT NULL,
	`selectedDates` text NOT NULL,
	FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plan_brand_month` ON `monthly_plans` (`brandId`,`month`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`brandId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`brandId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `special_dates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`segments` text NOT NULL,
	`relevance` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trello_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`contentId` text NOT NULL,
	`integrationId` text NOT NULL,
	`cardId` text NOT NULL,
	`syncedAt` text,
	FOREIGN KEY (`contentId`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`integrationId`) REFERENCES `trello_integrations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trello_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace` text NOT NULL,
	`board` text NOT NULL,
	`approvalList` text NOT NULL,
	`changesList` text NOT NULL,
	`approvedList` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL
);
