import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { Actions, PageServerLoad } from './$types';
import { and, eq, sql } from 'drizzle-orm';
import { isUuid } from '$lib/projects/domain';
import { getProjectSubmissionReadiness } from '$lib/projects/submission';
import { db } from '$lib/server/db';
import { journal, project } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/guards';
import { submitProjectAction } from '$lib/server/projects/actions';
import { getUserSubmissionProfile } from '$lib/server/user-profile';
import {
	getHackClubIdentity,
	hackClubAddressOptions,
	HackClubIdentityError
} from '$lib/server/hackclub-identity';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	if (!locals.user) return {} as never;
	setHeaders({ 'Cache-Control': 'private, no-store' });
	const user = requireUser(locals);
	if (!isUuid(params.id)) error(404, 'Project not found');

	const [existingProject] = await db
		.select({
			id: project.id,
			title: project.title,
			description: project.description,
			repoUrl: project.repoUrl,
			demoUrl: project.demoUrl,
			thumbnailUrl: project.thumbnailUrl,
			status: project.status,
			type: project.type,
			tier: project.tier,
			hackatimeProjects: project.hackatime_projects
		})
		.from(project)
		.where(and(eq(project.id, params.id), eq(project.userId, user.id)))
		.limit(1);

	if (!existingProject) error(404, 'Project not found');
	const [journalStats] = await db
		.select({ journalCount: sql<number>`COUNT(${journal.id})` })
		.from(journal)
		.where(eq(journal.projectId, params.id));

	const readiness = getProjectSubmissionReadiness(
		{ ...existingProject, journalCount: Number(journalStats?.journalCount ?? 0) },
		user.yswsEligible
	);
	let addressOptions: ReturnType<typeof hackClubAddressOptions> = [];
	let hackClubIdentityError: { code: string; message: string } | null = null;
	if (readiness.canSubmit) {
		try {
			addressOptions = hackClubAddressOptions(await getHackClubIdentity(user.id));
		} catch (identityError) {
			if (!(identityError instanceof HackClubIdentityError)) throw identityError;
			hackClubIdentityError = { code: identityError.code, message: identityError.message };
		}
	}

	return {
		project: existingProject,
		readiness,
		profile: await getUserSubmissionProfile(user.id),
		addressOptions,
		hackClubIdentityError
	};
};

export const actions: Actions = {
	submit: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		if (!isUuid(params.id)) error(404, 'Project not found');

		const result = await submitProjectAction(params.id, user.id, await request.formData());
		if ('data' in result) return result;

		redirect(303, resolve(`/home/projects/${params.id}`));
	},
	reconnectHackClub: async ({ locals, params, url }) => {
		requireUser(locals);
		if (!isUuid(params.id)) error(404, 'Project not found');
		const callbackURL = new URL(
			resolve(`/home/projects/${params.id}/submit`),
			url.origin
		).toString();
		const response = await auth.api.signInWithOAuth2({
			body: { providerId: 'hackclub', callbackURL }
		});
		if (response.redirect) redirect(302, response.url);
	}
};
