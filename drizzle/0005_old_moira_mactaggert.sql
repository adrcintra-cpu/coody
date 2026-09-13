CREATE TABLE `image_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`contentId` text NOT NULL,
	`status` text NOT NULL,
	`assetId` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL
);
