import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AdminError, getEventStats, requireAdmin } from '$lib/server/admin';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(404, 'Page not found');

	try {
		await requireAdmin(locals.user.id);
		const stats = await getEventStats();
		return { stats };
	} catch (caught) {
		if (caught instanceof AdminError) error(caught.status, caught.message);
		throw caught;
	}
};
