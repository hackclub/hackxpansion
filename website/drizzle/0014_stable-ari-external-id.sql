DROP INDEX "project_submission_feedback_ari_external_id_uniq";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "active_submission_feedback_id" uuid;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "submission_feedback_id" uuid;--> statement-breakpoint
UPDATE "project" SET "active_submission_feedback_id" = "project_submission_feedback"."id"
FROM "project_submission_feedback"
WHERE "project"."active_ari_external_id" = "project_submission_feedback"."ari_external_id";--> statement-breakpoint
UPDATE "review" SET "submission_feedback_id" = "project_submission_feedback"."id"
FROM "project_submission_feedback"
WHERE "review"."raw_payload"->>'external_id' = "project_submission_feedback"."ari_external_id";--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_active_submission_feedback_id_project_submission_feedback_id_fk" FOREIGN KEY ("active_submission_feedback_id") REFERENCES "public"."project_submission_feedback"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_submission_feedback_id_project_submission_feedback_id_fk" FOREIGN KEY ("submission_feedback_id") REFERENCES "public"."project_submission_feedback"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_active_submission_feedback_id_idx" ON "project" USING btree ("active_submission_feedback_id");--> statement-breakpoint
CREATE INDEX "project_submission_feedback_ari_external_id_idx" ON "project_submission_feedback" USING btree ("ari_external_id");--> statement-breakpoint
CREATE INDEX "review_submission_feedback_id_idx" ON "review" USING btree ("submission_feedback_id");
