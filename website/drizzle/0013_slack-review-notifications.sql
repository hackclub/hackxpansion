ALTER TABLE "review" ADD COLUMN "slack_message_ts" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "fraud_admin_slack_message_ts" text;--> statement-breakpoint
UPDATE "review" SET
	"slack_message_ts" = 'not-applicable',
	"fraud_admin_slack_message_ts" = 'not-applicable';
