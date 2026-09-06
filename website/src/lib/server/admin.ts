import { and, asc, countDistinct, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { account as authAccount } from '$lib/server/db/auth.schema';
import {
	journal,
	project,
	projectSubmissionFeedback,
	review,
	shopOrder,
	user
} from '$lib/server/db/schema';
import { getUserHackatimeProjectsWithStats } from '$lib/server/hackatime';
import { sumHackatimeMinutes } from '$lib/projects/time';

const CONFIGURED_ADMIN_HACKCLUB_ID = 'ident!ZVpfLg';

export class AdminError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'AdminError';
	}
}

export async function getHackatimeMinutesForProjects(
	projects: Array<{
		id: string;
		ownerSlackId: string | null;
		hackatimeProjects?: string[] | null;
	}>
): Promise<Map<string, number>> {
	const result = new Map<string, number>();

	const slackIdToProjects = new Map<string, Array<{ id: string; hackatimeProjects: string[] }>>();
	for (const p of projects) {
		const linked = p.hackatimeProjects?.filter((name) => name.trim().length > 0) ?? [];
		if (p.ownerSlackId && linked.length > 0) {
			const existing = slackIdToProjects.get(p.ownerSlackId) ?? [];
			existing.push({ id: p.id, hackatimeProjects: linked });
			slackIdToProjects.set(p.ownerSlackId, existing);
		}
	}

	const slackEntries = Array.from(slackIdToProjects.entries());
	const hackatimeResults = await Promise.allSettled(
		slackEntries.map(async ([slackId, projs]) => {
			const stats = await getUserHackatimeProjectsWithStats(slackId);
			return { projs, stats };
		})
	);

	for (const res of hackatimeResults) {
		if (res.status === 'fulfilled') {
			const { projs, stats } = res.value;
			for (const p of projs) {
				const minutes = sumHackatimeMinutes(p.hackatimeProjects, stats);
				result.set(p.id, minutes);
			}
		}
	}

	const missingProjectIds = projects.filter((p) => !result.has(p.id)).map((p) => p.id);
	if (missingProjectIds.length > 0) {
		const reviews = await db
			.select({
				projectId: review.projectId,
				minutesBreakdown: review.minutesBreakdown
			})
			.from(review)
			.where(inArray(review.projectId, missingProjectIds))
			.orderBy(desc(review.receivedAt));

		for (const r of reviews) {
			if (r.projectId && !result.has(r.projectId)) {
				const hackatimeMin = Number(r.minutesBreakdown?.hackatime ?? 0);
				if (hackatimeMin > 0) {
					result.set(r.projectId, hackatimeMin);
				}
			}
		}
	}

	for (const p of projects) {
		if (!result.has(p.id)) {
			result.set(p.id, 0);
		}
	}

	return result;
}

export async function getEventStats() {
	const [
		[userStats],
		[activeWorkUserStats],
		[projectStats],
		projectStatusCounts,
		projectTypeCounts,
		projectTierCounts,
		[submissionStats],
		[reviewStats],
		[orderStats],
		[journalStats],
		[waitingJournalStats],
		projectsForHackatime,
		[usersWithProject]
	] = await Promise.all([
		db
			.select({
				totalUsers: sql<number>`COUNT(${user.id})`,
				yswsEligibleCount: sql<number>`COUNT(CASE WHEN ${user.yswsEligible} THEN 1 END)`,
				adminCount: sql<number>`COUNT(CASE WHEN ${user.isAdmin} THEN 1 END)`,
				totalUserCurrency: sql<number>`COALESCE(SUM(${user.currency}), 0)`
			})
			.from(user),
		db
			.select({
				activeWorkUsers: sql<number>`COUNT(DISTINCT ${project.userId})`
			})
			.from(project)
			.leftJoin(journal, eq(journal.projectId, project.id))
			.where(
				sql`COALESCE(cardinality(${project.hackatime_projects}), 0) > 0 OR ${journal.id} IS NOT NULL`
			),
		db
			.select({
				totalProjects: sql<number>`COUNT(${project.id})`,
				totalCurrencyPaidOut: sql<number>`COALESCE(SUM(${project.currencyPaidOut}), 0)`,
				shippedToAriCount: sql<number>`COUNT(CASE WHEN ${project.hasShippedToAri} THEN 1 END)`
			})
			.from(project),
		db
			.select({
				status: project.status,
				count: sql<number>`COUNT(${project.id})`
			})
			.from(project)
			.groupBy(project.status),
		db
			.select({
				type: project.type,
				count: sql<number>`COUNT(${project.id})`
			})
			.from(project)
			.groupBy(project.type),
		db
			.select({
				tier: project.tier,
				count: sql<number>`COUNT(${project.id})`
			})
			.from(project)
			.groupBy(project.tier),
		db
			.select({
				totalSubmissions: sql<number>`COUNT(${projectSubmissionFeedback.id})`,
				avgNps: sql<number | null>`AVG(${projectSubmissionFeedback.nps})`
			})
			.from(projectSubmissionFeedback),
		db
			.select({
				totalReviews: sql<number>`COUNT(${review.id})`,
				totalApprovedMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${review.event} = 'approved' THEN ${review.approvedMinutes} ELSE 0 END), 0)`,
				totalApprovedHackatimeMinutes: sql<number>`COALESCE(SUM(((${review.minutesBreakdown}->>'hackatime')::int)), 0)`
			})
			.from(review),
		db
			.select({
				totalOrders: sql<number>`COUNT(${shopOrder.id})`,
				pendingOrders: sql<number>`COUNT(CASE WHEN ${shopOrder.status} = 'in_queue' THEN 1 END)`,
				fulfilledOrders: sql<number>`COUNT(CASE WHEN ${shopOrder.status} = 'fulfilled' THEN 1 END)`,
				totalSpent: sql<number>`COALESCE(SUM(${shopOrder.pricePaid}), 0)`
			})
			.from(shopOrder),
		db
			.select({
				totalJournals: sql<number>`COUNT(${journal.id})`,
				totalJournalMinutes: sql<number>`COALESCE(SUM(${journal.durationInMinutes}), 0)`
			})
			.from(journal),
		db
			.select({
				minutes: sql<number>`COALESCE(SUM(${journal.durationInMinutes}), 0)`
			})
			.from(journal)
			.innerJoin(project, eq(journal.projectId, project.id))
			.where(inArray(project.status, ['waiting_design', 'waiting_build'])),
		db
			.select({
				id: project.id,
				ownerSlackId: user.slackId,
				status: project.status,
				hackatimeProjects: project.hackatime_projects
			})
			.from(project)
			.innerJoin(user, eq(project.userId, user.id)),
		db
			.select({
				count: countDistinct(project.userId)
			})
			.from(project)
	]);

	const hackatimeMap = await getHackatimeMinutesForProjects(projectsForHackatime);
	let totalHackatimeMinutes = 0;
	let waitingHackatimeMinutes = 0;
	const waitingStatuses = new Set(['waiting_design', 'waiting_build']);
	for (const p of projectsForHackatime) {
		const mins = hackatimeMap.get(p.id) ?? 0;
		totalHackatimeMinutes += mins;
		if (waitingStatuses.has(p.status)) {
			waitingHackatimeMinutes += mins;
		}
	}

	const statusMap = Object.fromEntries(projectStatusCounts.map((s) => [s.status, Number(s.count)]));
	const typeMap = Object.fromEntries(projectTypeCounts.map((t) => [t.type, Number(t.count)]));
	const tierMap = Object.fromEntries(
		projectTierCounts.map((t) => [t.tier ?? 'unassigned', Number(t.count)])
	);

	const pendingReviewCount = (statusMap['waiting_design'] ?? 0) + (statusMap['waiting_build'] ?? 0);
	const approvedDesignCount = statusMap['approved_design'] ?? 0;
	const approvedBuildCount = statusMap['approved_build'] ?? 0;

	return {
		users: {
			total: Number(userStats?.totalUsers ?? 0),
			yswsEligible: Number(userStats?.yswsEligibleCount ?? 0),
			admins: Number(userStats?.adminCount ?? 0),
			totalCurrency: Number(userStats?.totalUserCurrency ?? 0),
			withActiveWork: Number(activeWorkUserStats?.activeWorkUsers ?? 0),
			withAtLeastOneProject: Number(usersWithProject?.count ?? 0)
		},
		projects: {
			total: Number(projectStats?.totalProjects ?? 0),
			totalCurrencyPaidOut: Number(projectStats?.totalCurrencyPaidOut ?? 0),
			shippedToAri: Number(projectStats?.shippedToAriCount ?? 0),
			pendingReview: pendingReviewCount,
			approvedDesign: approvedDesignCount,
			approvedBuild: approvedBuildCount,
			byStatus: statusMap,
			byType: typeMap,
			byTier: tierMap
		},
		submissions: {
			total: Number(submissionStats?.totalSubmissions ?? 0),
			avgNps:
				submissionStats?.avgNps !== null && submissionStats?.avgNps !== undefined
					? Number(Number(submissionStats.avgNps).toFixed(1))
					: null
		},
		reviews: {
			total: Number(reviewStats?.totalReviews ?? 0),
			totalApprovedMinutes: Number(reviewStats?.totalApprovedMinutes ?? 0),
			totalSubmittedMinutes:
				Number(reviewStats?.totalApprovedMinutes ?? 0) +
				Number(waitingJournalStats?.minutes ?? 0) +
				waitingHackatimeMinutes
		},
		orders: {
			total: Number(orderStats?.totalOrders ?? 0),
			pending: Number(orderStats?.pendingOrders ?? 0),
			fulfilled: Number(orderStats?.fulfilledOrders ?? 0),
			totalSpent: Number(orderStats?.totalSpent ?? 0)
		},
		journals: {
			total: Number(journalStats?.totalJournals ?? 0),
			totalMinutes: Number(journalStats?.totalJournalMinutes ?? 0)
		},
		hackatime: {
			totalMinutes: totalHackatimeMinutes,
			approvedMinutes: Number(reviewStats?.totalApprovedHackatimeMinutes ?? 0)
		}
	};
}

export async function isUserAdmin(userId: string) {
	await ensureConfiguredAdmin();

	const [row] = await db
		.select({ isAdmin: user.isAdmin })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row?.isAdmin === true;
}

export async function requireAdmin(userId: string) {
	if (!(await isUserAdmin(userId))) throw new AdminError(404, 'Page not found');
}

export async function getAdminUsers() {
	const users = await db
		.select({
			id: user.id,
			name: user.displayName,
			email: user.email,
			slackId: user.slackId,
			isAdmin: user.isAdmin,
			createdAt: user.createdAt
		})
		.from(user)
		.orderBy(desc(user.isAdmin), asc(user.displayName), asc(user.email));
	const configuredAdminUserId = await getConfiguredAdminUserId();
	return users.map((account) => ({
		...account,
		isProtectedAdmin: account.id === configuredAdminUserId
	}));
}

export async function getProtectedAdminNotificationTarget() {
	const [configuredAdmin] = await db
		.select({ userId: user.id, slackId: user.slackId })
		.from(authAccount)
		.innerJoin(user, eq(authAccount.userId, user.id))
		.where(
			and(
				eq(authAccount.providerId, 'hackclub'),
				eq(authAccount.accountId, CONFIGURED_ADMIN_HACKCLUB_ID)
			)
		)
		.limit(1);
	return configuredAdmin ?? null;
}

export async function promoteUserToAdmin(adminUserId: string, targetUserId: string) {
	await requireAdmin(adminUserId);
	const [promotedUser] = await db
		.update(user)
		.set({ isAdmin: true })
		.where(and(eq(user.id, targetUserId), eq(user.isAdmin, false)))
		.returning({ name: user.displayName });
	if (promotedUser) return promotedUser;

	const [targetUser] = await db
		.select({ isAdmin: user.isAdmin })
		.from(user)
		.where(eq(user.id, targetUserId))
		.limit(1);
	if (!targetUser) throw new AdminError(404, 'User not found.');
	throw new AdminError(409, 'This user is already an admin.');
}

export async function demoteUserFromAdmin(adminUserId: string, targetUserId: string) {
	await requireAdmin(adminUserId);
	if (targetUserId === (await getConfiguredAdminUserId())) {
		throw new AdminError(422, 'The configured admin cannot be demoted.');
	}

	const [demotedUser] = await db
		.update(user)
		.set({ isAdmin: false })
		.where(and(eq(user.id, targetUserId), eq(user.isAdmin, true)))
		.returning({ name: user.displayName });
	if (demotedUser) return demotedUser;

	const [targetUser] = await db
		.select({ isAdmin: user.isAdmin })
		.from(user)
		.where(eq(user.id, targetUserId))
		.limit(1);
	if (!targetUser) throw new AdminError(404, 'User not found.');
	throw new AdminError(409, 'This user is not an admin.');
}

async function getConfiguredAdminUserId() {
	const [configuredAccount] = await db
		.select({ userId: authAccount.userId })
		.from(authAccount)
		.where(
			and(
				eq(authAccount.providerId, 'hackclub'),
				eq(authAccount.accountId, CONFIGURED_ADMIN_HACKCLUB_ID)
			)
		)
		.limit(1);
	return configuredAccount?.userId ?? null;
}

async function ensureConfiguredAdmin() {
	const configuredAdminUserId = await getConfiguredAdminUserId();
	if (!configuredAdminUserId) return;
	await db
		.update(user)
		.set({ isAdmin: true })
		.where(and(eq(user.id, configuredAdminUserId), eq(user.isAdmin, false)));
}
