import { and, asc, eq, like, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { review } from '$lib/server/db/schema';
import {
	updateYswsProjectSubmissionAlternateTracking,
	type YswsAlternateTrackingUpdate
} from '$lib/server/airtable';

export type AlternateTrackingBackfillResult = {
	dryRun: boolean;
	candidates: number;
	updated: number;
};

export async function getAlternateTrackingBackfillRecords(): Promise<
	YswsAlternateTrackingUpdate[]
> {
	const rows = await db
		.select({
			deliveryId: review.deliveryId,
			recordId: review.airtableRecordId,
			auditNote: sql<string | null>`COALESCE(
				NULLIF(BTRIM(${review.auditNote}), ''),
				NULLIF(BTRIM(${review.rawPayload} -> 'review' ->> 'audit_note'), '')
			)`
		})
		.from(review)
		.where(and(eq(review.event, 'approved'), like(review.airtableRecordId, 'rec%')))
		.orderBy(asc(review.receivedAt));

	const updates = new Map<string, YswsAlternateTrackingUpdate>();
	for (const row of rows) {
		const auditNote = row.auditNote?.trim();
		if (!row.recordId || !auditNote) continue;

		updates.set(row.recordId, {
			deliveryId: row.deliveryId,
			recordId: row.recordId,
			auditNote
		});
	}

	return [...updates.values()];
}

export async function backfillAlternateTracking({
	personalAccessToken,
	dryRun
}: {
	personalAccessToken: string | undefined;
	dryRun: boolean;
}): Promise<AlternateTrackingBackfillResult> {
	const records = await getAlternateTrackingBackfillRecords();
	if (dryRun) {
		return { dryRun, candidates: records.length, updated: 0 };
	}

	const updated = await updateYswsProjectSubmissionAlternateTracking(records, personalAccessToken);
	return { dryRun, candidates: records.length, updated };
}
