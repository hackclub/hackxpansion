DROP INDEX IF EXISTS "project_card_md_pair_uniq";--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_resistor_assignment";--> statement-breakpoint
ALTER TYPE "public"."project_type" RENAME TO "project_type_old";--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('card', 'app', 'mod');--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "type" TYPE "public"."project_type" USING "type"::text::"public"."project_type";--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "design_approved_type" TYPE "public"."project_type" USING "design_approved_type"::text::"public"."project_type";--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "type" SET DEFAULT 'card';--> statement-breakpoint
DROP TYPE "public"."project_type_old";--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_resistor_assignment" CHECK (("project"."type" IN ('app', 'mod') AND "project"."md0" IS NULL AND "project"."md1" IS NULL) OR ("project"."type" = 'card' AND "project"."md0" IS NOT NULL AND "project"."md1" IS NOT NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "project_card_md_pair_uniq" ON "project" USING btree ("md0", "md1") WHERE type = 'card' AND md0 IS NOT NULL AND md1 IS NOT NULL;