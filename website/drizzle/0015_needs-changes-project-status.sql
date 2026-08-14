ALTER TYPE "public"."project_status" RENAME TO "project_status_old";--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM(
	'not_submitted',
	'waiting_design',
	'needs_changes_design',
	'rejected_design',
	'approved_design',
	'waiting_build',
	'needs_changes_build',
	'rejected_build',
	'approved_build'
);--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "status" TYPE "public"."project_status"
USING "status"::text::"public"."project_status";--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "status" SET DEFAULT 'not_submitted';--> statement-breakpoint
DROP TYPE "public"."project_status_old";--> statement-breakpoint
UPDATE "project"
SET "status" = CASE "status"
	WHEN 'rejected_design' THEN 'needs_changes_design'::"public"."project_status"
	WHEN 'rejected_build' THEN 'needs_changes_build'::"public"."project_status"
	ELSE "status"
END
WHERE "status" IN ('rejected_design', 'rejected_build')
	AND (
		SELECT "review"."event"
		FROM "review"
		WHERE "review"."project_id" = "project"."id"
		ORDER BY "review"."received_at" DESC
		LIMIT 1
	) = 'changes';
