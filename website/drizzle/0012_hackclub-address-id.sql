DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "project_submission_feedback") THEN
		RAISE EXCEPTION 'project_submission_feedback must be empty before removing stored address and birthday data';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "project_submission_feedback" ADD COLUMN "hack_club_address_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "project_submission_feedback" DROP COLUMN "birthday";--> statement-breakpoint
ALTER TABLE "project_submission_feedback" DROP COLUMN "address_line_1";--> statement-breakpoint
ALTER TABLE "project_submission_feedback" DROP COLUMN "address_line_2";--> statement-breakpoint
ALTER TABLE "project_submission_feedback" DROP COLUMN "address_city";--> statement-breakpoint
ALTER TABLE "project_submission_feedback" DROP COLUMN "address_region";--> statement-breakpoint
ALTER TABLE "project_submission_feedback" DROP COLUMN "address_postal_code";--> statement-breakpoint
ALTER TABLE "project_submission_feedback" DROP COLUMN "address_country";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "birthday";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "address_line_1";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "address_line_2";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "address_city";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "address_region";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "address_postal_code";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "address_country";
