import { createHash } from 'node:crypto';
import { formatMinutes, type ReviewEvent } from '$lib/projects/domain';
import type { ProjectReviewPhase } from '$lib/projects/lifecycle';
import { fetchWithTimeout } from '$lib/server/http';

const SLACK_CONVERSATIONS_OPEN_URL = 'https://slack.com/api/conversations.open';
const SLACK_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';

type SlackText = {
	type: 'plain_text' | 'mrkdwn';
	text: string;
	emoji?: boolean;
};

export type SlackBlock =
	| { type: 'header'; text: SlackText }
	| { type: 'section'; text: SlackText }
	| {
			type: 'actions';
			elements: Array<{
				type: 'button';
				text: SlackText;
				url: string;
				action_id: string;
			}>;
	  };

export type SlackMessage = {
	text: string;
	blocks: SlackBlock[];
};

export class SlackApiError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'SlackApiError';
	}
}

export async function sendSlackDirectMessage({
	botToken,
	userId,
	clientMessageId,
	message
}: {
	botToken: string | undefined;
	userId: string;
	clientMessageId: string;
	message: SlackMessage;
}) {
	if (!botToken) throw new SlackApiError('SLACK_BOT_TOKEN is not configured');

	const opened = await slackRequest(SLACK_CONVERSATIONS_OPEN_URL, botToken, {
		users: userId,
		return_im: true
	});
	const channel = isRecord(opened.channel) ? optionalString(opened.channel.id) : null;
	if (!channel) throw new SlackApiError('Slack conversations.open omitted the DM channel ID');

	const posted = await slackRequest(SLACK_POST_MESSAGE_URL, botToken, {
		channel,
		client_msg_id: clientMessageId,
		text: message.text,
		blocks: message.blocks,
		mrkdwn: false,
		unfurl_links: false,
		unfurl_media: false
	});
	const messageTs = optionalString(posted.ts);
	if (!messageTs) throw new SlackApiError('Slack chat.postMessage omitted the message timestamp');

	return { channel, messageTs };
}

export function buildProjectReviewSlackMessage({
	event,
	phase,
	projectTitle,
	projectUrl,
	noteToMaker,
	approvedMinutes
}: {
	event: ReviewEvent;
	phase: ProjectReviewPhase;
	projectTitle: string;
	projectUrl: string;
	noteToMaker: string | null;
	approvedMinutes: number | null;
}): SlackMessage {
	const outcome = reviewOutcome(event, phase);
	const normalizedTitle = projectTitle.trim().replace(/\s+/g, ' ') || 'Untitled project';
	const details = [
		`*Result:* ${outcome.label}`,
		`*Review:* ${phase === 'design' ? 'Design' : 'Build'}`
	];
	if (event === 'review.approved' && approvedMinutes !== null) {
		details.push(`*Approved time:* ${formatMinutes(approvedMinutes)}`);
	}

	const blocks: SlackBlock[] = [
		{
			type: 'header',
			text: {
				type: 'plain_text',
				text: truncate(`${outcome.label}: ${normalizedTitle}`, 150),
				emoji: true
			}
		},
		{ type: 'section', text: { type: 'mrkdwn', text: details.join('\n') } }
	];
	const normalizedNote = noteToMaker?.trim();
	if (normalizedNote) {
		blocks.push({
			type: 'section',
			text: {
				type: 'mrkdwn',
				text: `*Reviewer note*\n${truncate(escapeMrkdwn(normalizedNote), 2_800)}`
			}
		});
	}
	blocks.push(
		{
			type: 'section',
			text: { type: 'mrkdwn', text: `*Next steps*\n${escapeMrkdwn(outcome.nextSteps)}` }
		},
		{
			type: 'actions',
			elements: [
				{
					type: 'button',
					text: { type: 'plain_text', text: 'Open project', emoji: true },
					url: projectUrl,
					action_id: 'open_reviewed_project'
				}
			]
		}
	);

	const noteSummary = normalizedNote ? ` Reviewer note: ${normalizedNote}` : '';
	return {
		text: truncate(
			`${outcome.label} for ${normalizedTitle}. ${outcome.nextSteps}${noteSummary} ${projectUrl}`,
			4_000
		),
		blocks
	};
}

export function buildFraudAdminSlackMessage({
	projectTitle,
	projectId,
	projectUrl,
	makerSlackId,
	makerUserId
}: {
	projectTitle: string;
	projectId: string;
	projectUrl: string;
	makerSlackId: string;
	makerUserId: string;
}): SlackMessage {
	const normalizedTitle = projectTitle.trim().replace(/\s+/g, ' ') || 'Untitled project';
	const safeTitle = truncate(escapeMrkdwn(normalizedTitle), 2_000);
	const details = [
		`*Project name:* ${safeTitle}`,
		`*Project ID:* ${escapeMrkdwn(projectId)}`,
		`*Slack user ID:* ${escapeMrkdwn(makerSlackId)}`,
		`*Platform user ID:* ${escapeMrkdwn(makerUserId)}`
	].join('\n');
	return {
		text: truncate(
			`Fraud review received for ${normalizedTitle}. Project ID: ${projectId}. Slack user ID: ${makerSlackId}. Platform user ID: ${makerUserId}. ${projectUrl}`,
			4_000
		),
		blocks: [
			{
				type: 'header',
				text: {
					type: 'plain_text',
					text: truncate(`Fraud review: ${normalizedTitle}`, 150),
					emoji: true
				}
			},
			{ type: 'section', text: { type: 'mrkdwn', text: details } },
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						text: { type: 'plain_text', text: 'Open project', emoji: true },
						url: projectUrl,
						action_id: 'open_fraud_review_project'
					}
				]
			}
		]
	};
}

export function fraudAdminSlackClientMessageId(reviewId: string) {
	const hash = createHash('sha256').update(`fraud-admin:${reviewId}`).digest('hex');
	return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function reviewOutcome(event: ReviewEvent, phase: ProjectReviewPhase) {
	switch (event) {
		case 'review.approved':
			return phase === 'design'
				? {
						label: 'Design approved',
						nextSteps:
							"Your project's design got approved :yay: Your grant for your project will arrive soon(TM)"
					}
				: {
						label: 'Build approved',
						nextSteps: "Your project's design got approved :yay:"
					};
		case 'review.changes':
			return {
				label: 'Changes requested',
				nextSteps: `Review the feedback, update your project, and submit it for ${phase} review again.`
			};
		case 'review.rejected':
			return {
				label: 'Rejected!!!',
				nextSteps: `Review the feedback, update your project, and submit it for ${phase} review again.`
			};
		case 'review.requeued':
			return {
				label: 'Back in review',
				nextSteps: 'No action is required while your project is reviewed again.'
			};
		case 'review.reverted':
			return {
				label: 'Review reopened',
				nextSteps: 'No action is required while the review is reconsidered.'
			};
		case 'review.fraud':
			return {
				label: 'Needs manual review',
				nextSteps: 'A Hack Club team member will contact you. '
			};
	}
}

async function slackRequest(url: string, botToken: string, body: Record<string, unknown>) {
	let response: Response;
	try {
		response = await fetchWithTimeout(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${botToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});
	} catch (error) {
		throw new SlackApiError('Slack API request failed', { cause: error });
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch (error) {
		throw new SlackApiError(`Slack API returned an invalid response (${response.status})`, {
			cause: error
		});
	}
	if (!isRecord(data)) {
		throw new SlackApiError(`Slack API returned an invalid response (${response.status})`);
	}
	if (!response.ok || data.ok !== true) {
		const code = optionalString(data.error) ?? `HTTP ${response.status}`;
		throw new SlackApiError(`Slack API request failed (${code})`);
	}
	return data;
}

function escapeMrkdwn(value: string) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function truncate(value: string, maxLength: number) {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function optionalString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
