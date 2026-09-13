CREATE TABLE `trello_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`credentials` text NOT NULL,
	`memberId` text NOT NULL,
	`memberName` text NOT NULL,
	`boardId` text DEFAULT '' NOT NULL,
	`boardName` text DEFAULT '' NOT NULL,
	`approvalList` text DEFAULT '' NOT NULL,
	`changesList` text DEFAULT '' NOT NULL,
	`approvedList` text DEFAULT '' NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trello_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`contentId` text NOT NULL,
	`versionId` text NOT NULL,
	`boardId` text NOT NULL,
	`cardId` text DEFAULT '' NOT NULL,
	`cardUrl` text DEFAULT '' NOT NULL,
	`state` text NOT NULL,
	`leaseUntil` integer DEFAULT 0 NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`contentId`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`versionId`) REFERENCES `content_versions`(`id`) ON UPDATE no action ON DELETE no action
);
