ALTER TABLE "project" ADD COLUMN "has_shipped_to_ari" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "project"
SET "has_shipped_to_ari" = true
WHERE "active_ari_external_id" IS NOT NULL
	OR EXISTS (
		SELECT 1
		FROM "project_submission_feedback"
		WHERE "project_submission_feedback"."project_id" = "project"."id"
	)
	OR EXISTS (
		SELECT 1
		FROM "review"
		WHERE "review"."project_id" = "project"."id"
	);
