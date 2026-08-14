import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	fromOutboundEvent,
	normalizeMinutesBreakdown,
	OutboundWebhookError,
	processOutboundRequest,
	type MinutesBreakdown,
	type OutboundBody
} from '$lib/server/ari/outbound';
import { db } from '$lib/server/db';
import { project, projectSubmissionFeedback, review, user } from '$lib/server/db/schema';
import { createYswsProjectSubmission, type YswsProjectApproval } from '$lib/server/airtable';
import {
	getApprovalCurrencyPayout,
	getProjectStatusAfterAriEvent,
	type ProjectReviewPhase
} from '$lib/projects/lifecycle';
import { isUuid, type ProjectStatus } from '$lib/projects/domain';
import { env } from '$env/dynamic/private';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { fetchHackClubRealName } from '$lib/server/hackclub-real-name';
import { getHackClubIdentity, resolveHackClubAddress } from '$lib/server/hackclub-identity';
import {
	buildFraudAdminSlackMessage,
	buildProjectReviewSlackMessage,
	fraudAdminSlackClientMessageId,
	sendSlackDirectMessage
} from '$lib/server/slack';
import { resolve } from '$app/paths';
import { getProtectedAdminNotificationTarget } from '$lib/server/admin';

export const POST: RequestHandler = async ({ request }) => {
	if (!env.ARI_OUT_SECRET) {
		error(500, 'Ari webhooks are not configured');
	}

	try {
		const { body, headers } = await processOutboundRequest(request, env.ARI_OUT_SECRET);
		const minutesBreakdown = getMinutesBreakdown(body);
		const result = await db.transaction(async (tx) => {
			const [activeProject] = await tx
				.select(approvalProjectFields)
				.from(project)
				.innerJoin(user, eq(project.userId, user.id))
				.where(eq(project.activeAriExternalId, body.external_id))
				.limit(1)
				.for('update', { of: project });

			const associatedProjectId = activeProject?.id ?? (await findAssociatedProjectId(tx, body));
			if (!associatedProjectId) {
				throw new OutboundWebhookError(404, 'Ari delivery does not match a known project');
			}

			const nextProjectStatus = activeProject
				? getProjectStatusAfterAriEvent(activeProject.status, body.event)
				: null;
			const airtableExportEligible =
				activeProject !== undefined &&
				body.event === 'review.approved' &&
				nextProjectStatus !== null;
			const slackNotificationEligible =
				activeProject !== undefined &&
				(nextProjectStatus !== null || body.event === 'review.fraud');
			const fraudAdminNotificationEligible =
				activeProject !== undefined && body.event === 'review.fraud';

			const inserted = await tx
				.insert(review)
				.values({
					event: fromOutboundEvent(body.event),
					ariId: body.id,
					deliveryId: headers.delivery_id,
					projectId: associatedProjectId,
					submissionFeedbackId: activeProject?.activeSubmissionFeedbackId ?? null,
					minutesBreakdown,
					noteToMaker: body.review.note_to_maker ?? null,
					auditNote: body.review.audit_note ?? null,
					justification: body.review.justification ?? null,
					fields: body.review.fields ?? null,
					collaborators: body.collaborators ?? null,
					fraud: body.fraud ?? null,
					reviewer: body.review.reviewer ?? null,
					rawPayload: body,
					airtableRecordId:
						body.event === 'review.approved' && !airtableExportEligible ? 'not-applicable' : null,
					slackMessageTs: slackNotificationEligible ? null : 'not-applicable',
					fraudAdminSlackMessageTs: fraudAdminNotificationEligible ? null : 'not-applicable'
				})
				.onConflictDoNothing({ target: review.deliveryId })
				.returning({
					id: review.id,
					ariId: review.ariId,
					projectId: review.projectId,
					submissionFeedbackId: review.submissionFeedbackId,
					rawPayload: review.rawPayload,
					minutesBreakdown: review.minutesBreakdown,
					noteToMaker: review.noteToMaker,
					justification: review.justification,
					auditNote: review.auditNote,
					airtableRecordId: review.airtableRecordId,
					slackMessageTs: review.slackMessageTs,
					fraudAdminSlackMessageTs: review.fraudAdminSlackMessageTs
				});

			const [existingReview] = inserted.length
				? inserted
				: await tx
						.select({
							id: review.id,
							ariId: review.ariId,
							projectId: review.projectId,
							submissionFeedbackId: review.submissionFeedbackId,
							rawPayload: review.rawPayload,
							minutesBreakdown: review.minutesBreakdown,
							noteToMaker: review.noteToMaker,
							justification: review.justification,
							auditNote: review.auditNote,
							airtableRecordId: review.airtableRecordId,
							slackMessageTs: review.slackMessageTs,
							fraudAdminSlackMessageTs: review.fraudAdminSlackMessageTs
						})
						.from(review)
						.where(eq(review.deliveryId, headers.delivery_id))
						.limit(1);
			if (!existingReview) throw new Error('Could not resolve the stored Ari review');
			const duplicate = inserted.length === 0;
			if (duplicate) assertDuplicateMatches(existingReview, associatedProjectId, body);
			const storedBody = existingReview.rawPayload;
			const [submissionFeedback] = existingReview.submissionFeedbackId
				? await tx
						.select({
							howDidYouHear: projectSubmissionFeedback.howDidYouHear,
							whatAreWeDoingWell: projectSubmissionFeedback.whatAreWeDoingWell,
							howCanWeImprove: projectSubmissionFeedback.howCanWeImprove,
							phase: projectSubmissionFeedback.phase,
							githubUsername: projectSubmissionFeedback.githubUsername,
							hackClubAddressId: projectSubmissionFeedback.hackClubAddressId,
							projectRepoUrl: projectSubmissionFeedback.projectRepoUrl,
							projectDemoUrl: projectSubmissionFeedback.projectDemoUrl,
							projectThumbnailUrl: projectSubmissionFeedback.projectThumbnailUrl,
							projectDescription: projectSubmissionFeedback.projectDescription,
							makerEmail: projectSubmissionFeedback.makerEmail,
							makerSlackId: projectSubmissionFeedback.makerSlackId
						})
						.from(projectSubmissionFeedback)
						.where(eq(projectSubmissionFeedback.id, existingReview.submissionFeedbackId))
						.limit(1)
				: [];

			if (activeProject) {
				assertMakerMatches(
					submissionFeedback
						? {
								makerEmail: submissionFeedback.makerEmail,
								makerSlackId: submissionFeedback.makerSlackId
							}
						: activeProject,
					body
				);
			}

			let projectStatus = null;
			let currencyAwarded = 0;
			if (!duplicate && activeProject) {
				const nextStatus = nextProjectStatus;
				if (nextStatus) {
					const payout =
						body.event === 'review.approved'
							? getApprovalCurrencyPayout(activeProject.status, activeProject.tier)
							: null;
					const payoutAlreadyAwarded =
						payout?.phase === 'design'
							? activeProject.designCurrencyAwarded
							: payout?.phase === 'build'
								? activeProject.buildCurrencyAwarded
								: false;
					const payoutUpdates =
						payout && !payoutAlreadyAwarded
							? {
									currencyPaidOut: sql`${project.currencyPaidOut} + ${payout.amount}`,
									...(payout.phase === 'design'
										? {
												designCurrencyAwarded: true,
												designApprovedType: activeProject.type
											}
										: { buildCurrencyAwarded: true })
								}
							: {};
					const [updatedProject] = await tx
						.update(project)
						.set({ status: nextStatus, ...payoutUpdates })
						.where(
							and(
								eq(project.id, activeProject.id),
								eq(project.activeAriExternalId, body.external_id),
								existingReview.submissionFeedbackId
									? eq(project.activeSubmissionFeedbackId, existingReview.submissionFeedbackId)
									: isNull(project.activeSubmissionFeedbackId)
							)
						)
						.returning({ status: project.status });
					projectStatus = updatedProject?.status ?? null;

					if (updatedProject && payout && !payoutAlreadyAwarded) {
						await tx
							.update(user)
							.set({ currency: sql`${user.currency} + ${payout.amount}` })
							.where(eq(user.id, activeProject.userId));
						currencyAwarded = payout.amount;
					}
				}
			}

			const shouldPrepareAirtable =
				storedBody.event === 'review.approved' && !existingReview.airtableRecordId;
			const shouldPrepareSlack = !existingReview.slackMessageTs;
			const shouldPrepareFraudAdminSlack = !existingReview.fraudAdminSlackMessageTs;
			const relatedProject =
				activeProject ??
				(shouldPrepareAirtable || shouldPrepareSlack || shouldPrepareFraudAdminSlack
					? (
							await tx
								.select(approvalProjectFields)
								.from(project)
								.innerJoin(user, eq(project.userId, user.id))
								.where(eq(project.id, associatedProjectId))
								.limit(1)
						)[0]
					: null);
			if (
				(shouldPrepareAirtable || shouldPrepareSlack || shouldPrepareFraudAdminSlack) &&
				!relatedProject
			) {
				throw new Error('Could not load the reviewed project');
			}

			const slackNotification =
				shouldPrepareSlack && relatedProject
					? {
							reviewId: existingReview.id,
							recipientSlackId: submissionFeedback?.makerSlackId ?? relatedProject.makerSlackId,
							projectId: relatedProject.id,
							projectTitle: relatedProject.title,
							phase: submissionFeedback?.phase ?? reviewPhaseFromStatus(relatedProject.status),
							event: storedBody.event,
							noteToMaker: existingReview.noteToMaker,
							approvedMinutes: sumApprovedMinutes(existingReview.minutesBreakdown)
						}
					: null;
			const fraudAdminNotification =
				shouldPrepareFraudAdminSlack && relatedProject
					? {
							reviewId: existingReview.id,
							projectId: relatedProject.id,
							projectTitle: relatedProject.title,
							makerSlackId: submissionFeedback?.makerSlackId ?? relatedProject.makerSlackId,
							makerUserId: relatedProject.userId
						}
					: null;

			let airtableApproval: YswsProjectApproval | null = null;
			let airtableUserId: string | null = null;
			let airtableAddressId: string | null = null;
			if (shouldPrepareAirtable) {
				if (!relatedProject) throw new Error('Could not load the approved project');
				if (!submissionFeedback) throw new Error('Could not load the approved submission');
				airtableUserId = relatedProject.userId;
				airtableAddressId = submissionFeedback.hackClubAddressId;
				airtableApproval = {
					ariApprovalDeliveryId: headers.delivery_id,
					project: {
						repoUrl: submissionFeedback
							? submissionFeedback.projectRepoUrl
							: relatedProject.repoUrl,
						demoUrl: submissionFeedback
							? submissionFeedback.projectDemoUrl
							: relatedProject.demoUrl,
						thumbnailUrl: submissionFeedback
							? submissionFeedback.projectThumbnailUrl
							: relatedProject.thumbnailUrl,
						description: submissionFeedback
							? submissionFeedback.projectDescription
							: relatedProject.description
					},
					maker: {
						name: relatedProject.makerDisplayName,
						givenName: null,
						email: submissionFeedback ? submissionFeedback.makerEmail : relatedProject.makerEmail,
						githubUsername: submissionFeedback
							? submissionFeedback.githubUsername
							: relatedProject.makerGithubUsername,
						birthday: null,
						addressLine1: null,
						addressLine2: null,
						addressCity: null,
						addressRegion: null,
						addressPostalCode: null,
						addressCountry: null
					},
					feedback: submissionFeedback
						? {
								howDidYouHear: submissionFeedback.howDidYouHear,
								whatAreWeDoingWell: submissionFeedback.whatAreWeDoingWell,
								howCanWeImprove: submissionFeedback.howCanWeImprove
							}
						: null,
					approvedMinutes: sumApprovedMinutes(existingReview.minutesBreakdown),
					justification: existingReview.justification,
					auditNote: existingReview.auditNote
				};
			}

			return {
				duplicate,
				id: existingReview.id,
				projectStatus,
				currencyAwarded,
				stale: !activeProject,
				airtableApproval,
				airtableUserId,
				airtableAddressId,
				slackNotification,
				fraudAdminNotification
			};
		});

		const sideEffects: Promise<void>[] = [];
		if (result.airtableApproval && result.airtableUserId && result.airtableAddressId) {
			sideEffects.push(
				(async () => {
					const identity = await getHackClubIdentity(result.airtableUserId!);
					const realName = await fetchHackClubRealName(result.airtableUserId!);
					const address = resolveHackClubAddress(identity, result.airtableAddressId!);
					const airtableRecordId = await createYswsProjectSubmission(
						{
							...result.airtableApproval!,
							maker: {
								...result.airtableApproval!.maker,
								name: realName,
								givenName: null,
								birthday: identity.birthday,
								addressLine1: address.line1,
								addressLine2: address.line2,
								addressCity: address.city,
								addressRegion: address.region,
								addressPostalCode: address.postalCode,
								addressCountry: address.country
							}
						},
						env.AIRTABLE_PAC
					);
					await db
						.update(review)
						.set({ airtableRecordId })
						.where(and(eq(review.id, result.id), isNull(review.airtableRecordId)));
				})()
			);
		}

		if (result.slackNotification) {
			sideEffects.push(sendReviewSlackNotification(result.slackNotification));
		}
		if (result.fraudAdminNotification) {
			sideEffects.push(sendFraudAdminSlackNotification(result.fraudAdminNotification));
		}
		const outcomes = await Promise.allSettled(sideEffects);
		const failures = outcomes
			.filter((outcome) => outcome.status === 'rejected')
			.map((outcome) => outcome.reason);
		if (failures.length > 0) {
			throw new AggregateError(failures, 'Could not complete review delivery side effects');
		}

		if (result.duplicate) return json({ status: 'duplicate' });
		return json({
			status: result.stale ? 'recorded_stale' : 'ok',
			id: result.id,
			project_status: result.projectStatus,
			currency_awarded: result.currencyAwarded
		});
	} catch (err) {
		if (err instanceof OutboundWebhookError) {
			console.error(`[ari/outbound] ${err.status} ${err.message}`);
			error(err.status, err.message);
		}

		console.error('[ari/outbound] Unexpected error processing webhook', err);
		throw err;
	}
};

const approvalProjectFields = {
	id: project.id,
	title: project.title,
	status: project.status,
	type: project.type,
	tier: project.tier,
	userId: project.userId,
	designCurrencyAwarded: project.designCurrencyAwarded,
	buildCurrencyAwarded: project.buildCurrencyAwarded,
	repoUrl: project.repoUrl,
	demoUrl: project.demoUrl,
	thumbnailUrl: project.thumbnailUrl,
	description: project.description,
	makerDisplayName: user.displayName,
	makerEmail: user.email,
	makerSlackId: user.slackId,
	makerGithubUsername: user.githubUsername,
	activeSubmissionFeedbackId: project.activeSubmissionFeedbackId
};

function assertDuplicateMatches(
	stored: { ariId: string; projectId: string | null; rawPayload: OutboundBody },
	associatedProjectId: string,
	incoming: OutboundBody
) {
	if (
		stored.ariId !== incoming.id ||
		stored.projectId !== associatedProjectId ||
		stored.rawPayload.external_id !== incoming.external_id ||
		stored.rawPayload.event !== incoming.event
	) {
		throw new OutboundWebhookError(409, 'Ari delivery ID was reused with a different review');
	}
}

async function sendReviewSlackNotification(notification: {
	reviewId: string;
	recipientSlackId: string;
	projectId: string;
	projectTitle: string;
	phase: ProjectReviewPhase;
	event: OutboundBody['event'];
	noteToMaker: string | null;
	approvedMinutes: number | null;
}) {
	if (!env.ORIGIN) throw new Error('ORIGIN is not configured');
	const projectUrl = new URL(
		resolve(`/home/projects/${notification.projectId}`),
		env.ORIGIN
	).toString();
	const { messageTs } = await sendSlackDirectMessage({
		botToken: env.SLACK_BOT_TOKEN,
		userId: notification.recipientSlackId,
		clientMessageId: notification.reviewId,
		message: buildProjectReviewSlackMessage({
			event: notification.event,
			phase: notification.phase,
			projectTitle: notification.projectTitle,
			projectUrl,
			noteToMaker: notification.noteToMaker,
			approvedMinutes: notification.approvedMinutes
		})
	});
	await db
		.update(review)
		.set({ slackMessageTs: messageTs })
		.where(and(eq(review.id, notification.reviewId), isNull(review.slackMessageTs)));
}

async function sendFraudAdminSlackNotification(notification: {
	reviewId: string;
	projectId: string;
	projectTitle: string;
	makerSlackId: string;
	makerUserId: string;
}) {
	if (!env.ORIGIN) throw new Error('ORIGIN is not configured');
	const protectedAdmin = await getProtectedAdminNotificationTarget();
	if (!protectedAdmin)
		throw new Error('Protected admin account is not available for notifications');
	const projectUrl = new URL(
		resolve(`/home/admin/projects/${notification.projectId}`),
		env.ORIGIN
	).toString();
	const { messageTs } = await sendSlackDirectMessage({
		botToken: env.SLACK_BOT_TOKEN,
		userId: protectedAdmin.slackId,
		clientMessageId: fraudAdminSlackClientMessageId(notification.reviewId),
		message: buildFraudAdminSlackMessage({
			projectTitle: notification.projectTitle,
			projectId: notification.projectId,
			projectUrl,
			makerSlackId: notification.makerSlackId,
			makerUserId: notification.makerUserId
		})
	});
	await db
		.update(review)
		.set({ fraudAdminSlackMessageTs: messageTs })
		.where(and(eq(review.id, notification.reviewId), isNull(review.fraudAdminSlackMessageTs)));
}

function reviewPhaseFromStatus(status: ProjectStatus) {
	return status.endsWith('_build') ? ('build' as const) : ('design' as const);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function findAssociatedProjectId(tx: Transaction, body: OutboundBody) {
	const projectId = body.external_id.split(':', 1)[0];
	if (!isUuid(projectId)) return null;

	const [row] = await tx
		.select({ id: project.id })
		.from(project)
		.where(eq(project.id, projectId))
		.limit(1);
	return row?.id ?? null;
}

function assertMakerMatches(
	activeProject: { makerEmail: string; makerSlackId: string },
	body: OutboundBody
) {
	const emailMatches = activeProject.makerEmail.toLowerCase() === body.maker.email.toLowerCase();
	const slackMatches =
		body.maker.slack_id === null || body.maker.slack_id === activeProject.makerSlackId;
	if (!emailMatches || !slackMatches) {
		throw new OutboundWebhookError(422, 'Ari delivery maker does not match the project owner');
	}
}

function getMinutesBreakdown(body: OutboundBody): MinutesBreakdown | null {
	if (body.review.minutes_breakdown) {
		return normalizeMinutesBreakdown(body.review.minutes_breakdown);
	}
	if (body.review.approved_minutes !== undefined) {
		return normalizeMinutesBreakdown({ program: body.review.approved_minutes });
	}
	if (body.review.approved_hours !== undefined) {
		return normalizeMinutesBreakdown({ program: Math.round(body.review.approved_hours * 60) });
	}
	return null;
}

function sumApprovedMinutes(breakdown: MinutesBreakdown | null) {
	if (!breakdown) return null;
	return breakdown.hackatime + breakdown.journals + breakdown.lapse + breakdown.program;
}
