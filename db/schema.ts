import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const records = sqliteTable("life_records", { id: text("id").primaryKey(), kind: text("kind").notNull(), payload: text("payload").notNull(), updatedAt: text("updated_at").notNull() });
