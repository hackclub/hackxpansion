import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { AdminError, requireAdmin } from '$lib/server/admin';
import { requireUser } from '$lib/server/guards';
import {
	backfillAlternateTracking,
	getAlternateTrackingBackfillRecords
} from '$lib/server/airtable-backfill';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(404, 'Page not found');

	try {
		await requireAdmin(locals.user.id);
		const records = await getAlternateTrackingBackfillRecords();
		return {
			candidateCount: records.length,
			airtableConfigured: Boolean(env.AIRTABLE_PAC)
		};
	} catch (caught) {
		if (caught instanceof AdminError) error(caught.status, caught.message);
		throw caught;
	}
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const currentUser = requireUser(locals);

		try {
			await requireAdmin(currentUser.id);
		} catch (caught) {
			if (caught instanceof AdminError) {
				return fail(caught.status, { success: false, message: caught.message });
			}
			throw caught;
		}

		const formData = await request.formData();
		const dryRun = formData.get('mode') !== 'apply';
		if (!dryRun && !env.AIRTABLE_PAC) {
			return fail(500, { success: false, message: 'AIRTABLE_PAC is not configured.' });
		}

		try {
			const result = await backfillAlternateTracking({
				personalAccessToken: env.AIRTABLE_PAC,
				dryRun
			});
			return {
				success: true,
				message: result.dryRun
					? `Found ${result.candidates} approved project${result.candidates === 1 ? '' : 's'} with an audit note. No records were changed.`
					: `Updated ${result.updated} of ${result.candidates} approved project${result.candidates === 1 ? '' : 's'}.`
			};
		} catch (caught) {
			console.error('[admin/airtable] Alternate tracking backfill failed', caught);
			return fail(500, {
				success: false,
				message:
					caught instanceof Error
						? caught.message
						: 'Could not run the alternate tracking backfill.'
			});
		}
	}
};
