import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { FooterConfig } from "@/lib/types/footer";

// ─── Enums ──────────────────────────────────────────────────────

export const planEnum = pgEnum("plan", ["free", "pro", "team"]);
export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);
export const monitorTypeEnum = pgEnum("monitor_type", [
  "http",
  "ping",
  "tcp",
  "dns",
  "ssl",
  "heartbeat",
]);
export const monitorStatusEnum = pgEnum("monitor_status", [
  "up",
  "down",
  "degraded",
  "paused",
  "pending",
]);
export const checkStatusEnum = pgEnum("check_status", [
  "up",
  "down",
  "degraded",
]);
export const httpMethodEnum = pgEnum("http_method", ["GET", "POST", "HEAD"]);
export const incidentStatusEnum = pgEnum("incident_status", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);
export const incidentImpactEnum = pgEnum("incident_impact", [
  "none",
  "minor",
  "major",
  "critical",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "email",
  "slack",
  "discord",
  "webhook",
]);

// ─── Users ──────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Organizations ─────────────────────────────────────────────

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    plan: planEnum("plan").default("free").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    apiKey: text("api_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_idx").on(table.slug)]
);

// ─── Organization Members ──────────────────────────────────────

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("org_member_unique").on(table.organizationId, table.userId),
    index("org_members_org_id_idx").on(table.organizationId),
    index("org_members_user_id_idx").on(table.userId),
  ]
);

// ─── Organization Invitations ──────────────────────────────────

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRoleEnum("role").default("member").notNull(),
    token: text("token").notNull().unique(),
    invitedByUserId: uuid("invited_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("org_invitations_org_id_idx").on(table.organizationId),
    uniqueIndex("org_invitations_token_idx").on(table.token),
  ]
);

// ─── Sessions ───────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Monitors ───────────────────────────────────────────────────

export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: monitorTypeEnum("type").notNull(),
    target: text("target").notNull(),
    intervalSeconds: integer("interval_seconds").default(60).notNull(),
    timeoutMs: integer("timeout_ms").default(10000).notNull(),
    expectedStatusCode: integer("expected_status_code").default(200),
    method: httpMethodEnum("method").default("GET"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    body: text("body"),
    regions: text("regions")
      .array()
      .default(["us-east"])
      .notNull(),
    status: monitorStatusEnum("status").default("pending").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    isPaused: boolean("is_paused").default(false).notNull(),
    // Heartbeat-specific fields
    heartbeatToken: text("heartbeat_token").unique(),
    heartbeatIntervalSeconds: integer("heartbeat_interval_seconds"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("monitors_org_id_idx").on(table.organizationId),
    index("monitors_created_by_idx").on(table.createdByUserId),
  ]
);

// ─── Check Results (TimescaleDB hypertable) ─────────────────────

export const checkResults = pgTable(
  "check_results",
  {
    time: timestamp("time", { withTimezone: true }).defaultNow().notNull(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    region: text("region").default("us-east").notNull(),
    status: checkStatusEnum("status").notNull(),
    responseTimeMs: integer("response_time_ms"),
    statusCode: integer("status_code"),
    errorMessage: text("error_message"),
    tlsExpiry: timestamp("tls_expiry", { withTimezone: true }),
  },
  (table) => [
    index("check_results_monitor_id_idx").on(table.monitorId),
    index("check_results_time_idx").on(table.time),
  ]
);

// ─── Status Pages ───────────────────────────────────────────────

export const statusPages = pgTable(
  "status_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    customDomain: text("custom_domain").unique(),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    theme: text("theme").default("midnight").notNull(),
    brandColor: text("brand_color").default("#14b8a6").notNull(),
    customCss: text("custom_css"),
    headerText: text("header_text"),
    footerText: text("footer_text"),
    footerConfig: jsonb("footer_config").$type<FooterConfig>(),
    showUptimePercentage: boolean("show_uptime_percentage")
      .default(true)
      .notNull(),
    showResponseTime: boolean("show_response_time").default(true).notNull(),
    showHistoryDays: integer("show_history_days").default(90).notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("status_pages_org_id_idx").on(table.organizationId),
    uniqueIndex("status_pages_slug_idx").on(table.slug),
  ]
);

// ─── Status Page Monitors (join table) ──────────────────────────

export const statusPageMonitors = pgTable(
  "status_page_monitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    sortOrder: integer("sort_order").default(0).notNull(),
    groupName: text("group_name"),
    displayStyle: text("display_style").default("bars").notNull(),
  },
  (table) => [
    index("spm_status_page_id_idx").on(table.statusPageId),
    index("spm_monitor_id_idx").on(table.monitorId),
  ]
);

// ─── Incidents ──────────────────────────────────────────────────

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: incidentStatusEnum("status").default("investigating").notNull(),
    impact: incidentImpactEnum("impact").default("none").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("incidents_status_page_id_idx").on(table.statusPageId),
    index("incidents_org_id_idx").on(table.organizationId),
  ]
);

// ─── Incident Updates ───────────────────────────────────────────

export const incidentUpdates = pgTable(
  "incident_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    status: incidentStatusEnum("status").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("incident_updates_incident_id_idx").on(table.incidentId)]
);

// ─── Notification Channels ──────────────────────────────────────

export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    type: notificationTypeEnum("type").notNull(),
    name: text("name").notNull(),
    config: jsonb("config")
      .$type<Record<string, string>>()
      .notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("notification_channels_org_id_idx").on(table.organizationId)]
);

// ─── Subscribers ────────────────────────────────────────────────

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    confirmed: boolean("confirmed").default(false).notNull(),
    confirmationToken: text("confirmation_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (table) => [index("subscribers_status_page_id_idx").on(table.statusPageId)]
);

// ─── Relations ──────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  organizationMembers: many(organizationMembers),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  invitations: many(organizationInvitations),
  monitors: many(monitors),
  statusPages: many(statusPages),
  incidents: many(incidents),
  notificationChannels: many(notificationChannels),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
  })
);

export const organizationInvitationsRelations = relations(
  organizationInvitations,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationInvitations.organizationId],
      references: [organizations.id],
    }),
    invitedBy: one(users, {
      fields: [organizationInvitations.invitedByUserId],
      references: [users.id],
    }),
  })
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const monitorsRelations = relations(monitors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [monitors.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [monitors.createdByUserId],
    references: [users.id],
  }),
  checkResults: many(checkResults),
  statusPageMonitors: many(statusPageMonitors),
}));

export const checkResultsRelations = relations(checkResults, ({ one }) => ({
  monitor: one(monitors, {
    fields: [checkResults.monitorId],
    references: [monitors.id],
  }),
}));

export const statusPagesRelations = relations(statusPages, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [statusPages.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [statusPages.createdByUserId],
    references: [users.id],
  }),
  statusPageMonitors: many(statusPageMonitors),
  incidents: many(incidents),
  subscribers: many(subscribers),
}));

export const statusPageMonitorsRelations = relations(
  statusPageMonitors,
  ({ one }) => ({
    statusPage: one(statusPages, {
      fields: [statusPageMonitors.statusPageId],
      references: [statusPages.id],
    }),
    monitor: one(monitors, {
      fields: [statusPageMonitors.monitorId],
      references: [monitors.id],
    }),
  })
);

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [incidents.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [incidents.createdByUserId],
    references: [users.id],
  }),
  statusPage: one(statusPages, {
    fields: [incidents.statusPageId],
    references: [statusPages.id],
  }),
  updates: many(incidentUpdates),
}));

export const incidentUpdatesRelations = relations(
  incidentUpdates,
  ({ one }) => ({
    incident: one(incidents, {
      fields: [incidentUpdates.incidentId],
      references: [incidents.id],
    }),
  })
);

export const notificationChannelsRelations = relations(
  notificationChannels,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [notificationChannels.organizationId],
      references: [organizations.id],
    }),
    createdBy: one(users, {
      fields: [notificationChannels.createdByUserId],
      references: [users.id],
    }),
  })
);

export const subscribersRelations = relations(subscribers, ({ one }) => ({
  statusPage: one(statusPages, {
    fields: [subscribers.statusPageId],
    references: [statusPages.id],
  }),
}));
