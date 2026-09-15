CREATE TABLE `api_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`provider` text NOT NULL,
	`message` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `magnific_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspaceId` text NOT NULL,
	`contentId` text NOT NULL,
	`brandId` text NOT NULL,
	`taskId` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`format` text NOT NULL,
	`assetId` text NOT NULL,
	`revision` integer NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`notificationId` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatarUrl` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `brands` ADD `workspaceId` text DEFAULT 'main' NOT NULL;