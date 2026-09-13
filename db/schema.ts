import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  role: text().notNull(),
});
export const brands = sqliteTable('brands', {
  id: text().primaryKey(),
  name: text().notNull(),
  segment: text().notNull(),
  description: text().notNull(),
  website: text().notNull(),
  social: text().notNull(),
  instagram: text().notNull().default(''),
  linkedin: text().notNull().default(''),
  communicationStyle: text().notNull().default(''),
  rules: text().notNull().default(''),
  creationNotes: text().notNull().default(''),
  voice: text().notNull(),
  keywords: text().notNull(),
  forbidden: text().notNull(),
  direction: text().notNull(),
  notes: text().notNull(),
  colors: text().notNull(),
  fonts: text().notNull(),
  products: text().notNull(),
  services: text().notNull(),
  monthlyGoal: integer().notNull(),
  weeklyGoal: integer().notNull(),
  pillars: text().notNull(),
});
export const brandAssets = sqliteTable(
  'brand_assets',
  {
    description: text().notNull().default(''),
    aiNotes: text().notNull().default(''),
    updatedAt: text().notNull().default(''),
    id: text().primaryKey(),
    brandId: text()
      .notNull()
      .references(() => brands.id),
    name: text().notNull(),
    category: text().notNull(),
    mime: text().notNull(),
    url: text().notNull(),
    priority: integer().notNull().default(0),
    approved: integer().notNull().default(0),
    createdAt: text().notNull(),
  },
  (t) => [index('idx_assets_brand').on(t.brandId)],
);
export const brandGuidelines = sqliteTable('brand_guidelines', {
  id: text().primaryKey(),
  brandId: text()
    .notNull()
    .references(() => brands.id),
  rules: text().notNull(),
  updatedAt: text().notNull(),
});
export const products = sqliteTable('products', {
  id: text().primaryKey(),
  brandId: text()
    .notNull()
    .references(() => brands.id),
  name: text().notNull(),
  description: text(),
});
export const services = sqliteTable('services', {
  id: text().primaryKey(),
  brandId: text()
    .notNull()
    .references(() => brands.id),
  name: text().notNull(),
  description: text(),
});
export const contentPillars = sqliteTable('content_pillars', {
  id: text().primaryKey(),
  brandId: text()
    .notNull()
    .references(() => brands.id),
  name: text().notNull(),
  percent: integer().notNull(),
});
export const specialDates = sqliteTable('special_dates', {
  id: text().primaryKey(),
  brandId: text().references(() => brands.id),
  isGlobal: integer().notNull().default(0),
  name: text().notNull(),
  date: text().notNull(),
  segments: text().notNull(),
  relevance: text().notNull(),
});
export const monthlyPlans = sqliteTable(
  'monthly_plans',
  {
    id: text().primaryKey(),
    brandId: text()
      .notNull()
      .references(() => brands.id),
    month: text().notNull(),
    monthlyGoal: integer().notNull(),
    weeklyGoal: integer().notNull(),
    days: text().notNull(),
    campaign: text().notNull(),
    selectedDates: text().notNull(),
  },
  (t) => [uniqueIndex('idx_plan_brand_month').on(t.brandId, t.month)],
);
export const contentItems = sqliteTable(
  'content_items',
  {
    id: text().primaryKey(),
    revision: integer().notNull().default(0),
    brandId: text()
      .notNull()
      .references(() => brands.id),
    title: text().notNull(),
    brief: text().notNull(),
    objective: text().notNull(),
    pillar: text().notNull(),
    date: text().notNull(),
    format: text().notNull(),
    status: text().notNull(),
    createdAt: text().notNull(),
  },
  (t) => [index('idx_content_brand_date').on(t.brandId, t.date)],
);
export const contentVersions = sqliteTable(
  'content_versions',
  {
    id: text().primaryKey(),
    contentId: text()
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    number: integer().notNull(),
    headline: text().notNull(),
    copy: text().notNull(),
    caption: text().notNull(),
    hashtags: text().notNull(),
    feedUrl: text().notNull(),
    storyUrl: text().notNull(),
    change: text().notNull(),
    createdAt: text().notNull(),
    locked: integer().notNull().default(0),
  },
  (t) => [uniqueIndex('idx_version_content_number').on(t.contentId, t.number)],
);
export const generatedAssets = sqliteTable('generated_assets', {
  id: text().primaryKey(),
  versionId: text()
    .notNull()
    .references(() => contentVersions.id),
  format: text().notNull(),
  url: text().notNull(),
  createdAt: text().notNull(),
});
export const approvals = sqliteTable('approvals', {
  id: text().primaryKey(),
  contentId: text()
    .notNull()
    .references(() => contentItems.id, { onDelete: 'cascade' }),
  versionId: text()
    .notNull()
    .references(() => contentVersions.id),
  decision: text().notNull(),
  createdAt: text().notNull(),
  userId: text().references(() => users.id),
});
export const trelloIntegrations = sqliteTable('trello_integrations', {
  id: text().primaryKey(),
  workspace: text().notNull(),
  board: text().notNull(),
  approvalList: text().notNull(),
  changesList: text().notNull(),
  approvedList: text().notNull(),
});
export const trelloCards = sqliteTable('trello_cards', {
  id: text().primaryKey(),
  contentId: text()
    .notNull()
    .references(() => contentItems.id),
  integrationId: text()
    .notNull()
    .references(() => trelloIntegrations.id),
  cardId: text().notNull(),
  syncedAt: text(),
});
export const comments = sqliteTable('comments', {
  id: text().primaryKey(),
  contentId: text()
    .notNull()
    .references(() => contentItems.id, { onDelete: 'cascade' }),
  text: text().notNull(),
  createdAt: text().notNull(),
  user: text().notNull(),
});
export const activityLogs = sqliteTable('activity_logs', {
  id: text().primaryKey(),
  userId: text().references(() => users.id),
  action: text().notNull(),
  entityId: text().notNull(),
  createdAt: text().notNull(),
});

export const maintenanceBackups = sqliteTable('maintenance_backups', {
  id: text().primaryKey(),
  payload: text().notNull(),
  createdAt: text().notNull(),
});

export const trelloConnection = sqliteTable('trello_connection', {
  id: text().primaryKey(),
  credentials: text().notNull(),
  memberId: text().notNull(),
  memberName: text().notNull(),
  boardId: text().notNull().default(''),
  boardName: text().notNull().default(''),
  approvalList: text().notNull().default(''),
  changesList: text().notNull().default(''),
  approvedList: text().notNull().default(''),
  updatedAt: text().notNull(),
});
export const trelloExports = sqliteTable('trello_exports', {
  id: text().primaryKey(),
  contentId: text()
    .notNull()
    .references(() => contentItems.id),
  versionId: text()
    .notNull()
    .references(() => contentVersions.id),
  boardId: text().notNull(),
  cardId: text().notNull().default(''),
  cardUrl: text().notNull().default(''),
  state: text().notNull(),
  leaseUntil: integer().notNull().default(0),
  updatedAt: text().notNull(),
});
