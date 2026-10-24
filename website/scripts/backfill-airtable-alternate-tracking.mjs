import { setTimeout as sleep } from 'node:timers/promises';
import postgres from 'postgres';

// Keep these in sync with src/lib/server/airtable.ts.
const YSWS_BASE_ID = 'appdl599Ct1mJBIrV';
const YSWS_PROJECT_SUBMISSION_TABLE_ID = 'tblRSGunS3aJP94zf';
const ALTERNATE_TRACKING_METHOD_FIELD_ID = 'fldpsBmCzFJJS0w8C';
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
const personalAccessToken = process.env.AIRTABLE_PAC;

if (!databaseUrl) {
	throw new Error('APP_DATABASE_URL or DATABASE_URL is not set');
}
if (!dryRun && !personalAccessToken) {
	throw new Error('AIRTABLE_PAC is not set');
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });

try {
	const reviews = await sql`
		SELECT
			delivery_id,
			airtable_record_id,
			COALESCE(
				NULLIF(BTRIM(justification ->> 'unified_db_record'), ''),
				NULLIF(BTRIM(raw_payload -> 'review' -> 'justification' ->> 'unified_db_record'), ''),
				NULLIF(BTRIM(audit_note), ''),
				NULLIF(BTRIM(raw_payload -> 'review' ->> 'audit_note'), '')
			) AS alternate_tracking_method
		FROM review
		WHERE event = 'approved'
			AND airtable_record_id LIKE 'rec%'
		ORDER BY received_at
	`;
	const updates = new Map();

	for (const review of reviews) {
		const alternateTrackingMethod = review.alternate_tracking_method?.trim();
		if (!alternateTrackingMethod) continue;

		updates.set(review.airtable_record_id, {
			deliveryId: review.delivery_id,
			recordId: review.airtable_record_id,
			alternateTrackingMethod
		});
	}

	const records = [...updates.values()];
	console.log(
		`Found ${records.length} approved project${records.length === 1 ? '' : 's'} with an alternate tracking method to backfill.`
	);

	if (dryRun) {
		for (const record of records) {
			console.log(
				`Would update ${record.recordId} (${record.deliveryId}): ${record.alternateTrackingMethod}`
			);
		}
		console.log('Dry run complete; no Airtable records were changed.');
	} else {
		let updated = 0;
		for (let index = 0; index < records.length; index += BATCH_SIZE) {
			const batch = records.slice(index, index + BATCH_SIZE);
			await updateAlternateTracking(batch);
			updated += batch.length;
			console.log(`Updated ${updated}/${records.length} record${records.length === 1 ? '' : 's'}.`);
			if (index + BATCH_SIZE < records.length) await sleep(250);
		}
		console.log('Airtable alternate tracking backfill complete.');
	}
} finally {
	await sql.end({ timeout: 5 });
}

async function updateAlternateTracking(records) {
	const body = JSON.stringify({
		records: records.map((record) => ({
			id: record.recordId,
			fields: { [ALTERNATE_TRACKING_METHOD_FIELD_ID]: record.alternateTrackingMethod }
		}))
	});

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		let response;
		try {
			response = await fetch(
				`https://api.airtable.com/v0/${YSWS_BASE_ID}/${YSWS_PROJECT_SUBMISSION_TABLE_ID}`,
				{
					method: 'PATCH',
					headers: {
						Authorization: `Bearer ${personalAccessToken}`,
						'Content-Type': 'application/json'
					},
					body,
					signal: AbortSignal.timeout(30_000)
				}
			);
		} catch (error) {
			if (attempt === MAX_ATTEMPTS) throw error;
			await sleep(attempt * 1_000);
			continue;
		}

		if (response.ok) return;

		const responseBody = await response.text();
		const retryAfterSeconds = Number(response.headers.get('retry-after'));
		if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
			await sleep(
				Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
					? retryAfterSeconds * 1_000
					: attempt * 1_000
			);
			continue;
		}

		throw new Error(`Airtable backfill failed (${response.status}): ${responseBody}`);
	}
}
