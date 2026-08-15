import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewEvent } from '$lib/projects/domain';
import {
	buildFraudAdminSlackMessage,
	buildProjectReviewSlackMessage,
	fraudAdminSlackClientMessageId,
	sendSlackDirectMessage,
	SlackApiError
} from './slack';

afterEach(() => vi.unstubAllGlobals());

describe('Slack direct messages', () => {
	it('opens a DM and posts the message with a deterministic client ID', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ ok: true, channel: { id: 'D123' } }))
			.mockResolvedValueOnce(Response.json({ ok: true, channel: 'D123', ts: '123.456' }));
		vi.stubGlobal('fetch', fetchMock);
		const message = buildProjectReviewSlackMessage({
			event: 'review.approved',
			phase: 'design',
			projectTitle: 'My project',
			projectUrl: 'https://example.com/home/projects/project-1',
			noteToMaker: 'Nice work!',
			approvedMinutes: 90
		});

		await expect(
			sendSlackDirectMessage({
				botToken: 'xoxb-secret',
				userId: 'U123',
				clientMessageId: '019ff59c-69b3-785a-9618-a2ee6ae323a1',
				message
			})
		).resolves.toEqual({ channel: 'D123', messageTs: '123.456' });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [openUrl, openInit] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(openUrl).toBe('https://slack.com/api/conversations.open');
		expect(openInit.method).toBe('POST');
		expect(new Headers(openInit.headers).get('Authorization')).toBe('Bearer xoxb-secret');
		expect(JSON.parse(String(openInit.body))).toEqual({ users: 'U123', return_im: true });

		const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(postUrl).toBe('https://slack.com/api/chat.postMessage');
		expect(JSON.parse(String(postInit.body))).toMatchObject({
			channel: 'D123',
			client_msg_id: '019ff59c-69b3-785a-9618-a2ee6ae323a1',
			mrkdwn: false,
			unfurl_links: false,
			unfurl_media: false
		});
	});

	it('requires a configured bot token', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			sendSlackDirectMessage({
				botToken: undefined,
				userId: 'U123',
				clientMessageId: 'review-1',
				message: { text: 'Review result', blocks: [] }
			})
		).rejects.toThrowError(new SlackApiError('SLACK_BOT_TOKEN is not configured'));
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('reports Slack API error codes without including response payloads', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ ok: false, error: 'missing_scope' }))
		);

		await expect(
			sendSlackDirectMessage({
				botToken: 'xoxb-secret',
				userId: 'U123',
				clientMessageId: 'review-1',
				message: { text: 'Review result', blocks: [] }
			})
		).rejects.toThrowError('Slack API request failed (missing_scope)');
	});
});

describe('project review Slack messages', () => {
	it('includes the result, approved time, maker-facing note, link, and design next steps', () => {
		const message = buildProjectReviewSlackMessage({
			event: 'review.approved',
			phase: 'design',
			projectTitle: 'My <great> project',
			projectUrl: 'https://example.com/home/projects/project-1',
			noteToMaker: 'Nice work <@U999> & keep going!',
			approvedMinutes: 90
		});
		const blocks = JSON.stringify(message.blocks);

		expect(message.text).toContain('Design approved');
		expect(blocks).toContain('Approved time:* 1h 30m');
		expect(blocks).toContain('Nice work &lt;@U999&gt; &amp; keep going!');
		expect(blocks).toContain("project's design got approved");
		expect(blocks).toContain('https://example.com/home/projects/project-1');
	});

	it.each<[ReviewEvent, string, string]>([
		['review.approved', 'Build approved', 'design got approved'],
		['review.changes', 'Changes requested', 'submit it for build review again'],
		['review.rejected', 'Rejected!!!', 'submit it for build review again'],
		['review.requeued', 'Back in review', 'No action is required'],
		['review.reverted', 'Review reopened', 'No action is required'],
		['review.fraud', 'Needs manual review', 'team member will contact you']
	])('maps %s to maker-safe result and next steps', (event, result, nextSteps) => {
		const message = buildProjectReviewSlackMessage({
			event,
			phase: 'build',
			projectTitle: 'My project',
			projectUrl: 'https://example.com/project',
			noteToMaker: null,
			approvedMinutes: null
		});
		const rendered = JSON.stringify(message);

		expect(rendered).toContain(result);
		expect(rendered).toContain(nextSteps);
		expect(rendered).not.toContain('audit');
		expect(rendered).not.toContain('fraud');
	});

	it('builds the protected-admin fraud alert with project and maker identifiers', () => {
		const message = buildFraudAdminSlackMessage({
			projectTitle: 'Suspicious project',
			projectId: '019ff59c-69b3-785a-9618-a2ee6ae323a1',
			projectUrl: 'https://example.com/home/projects/019ff59c-69b3-785a-9618-a2ee6ae323a1',
			makerSlackId: 'U12345678',
			makerUserId: 'platform-user-1'
		});
		const rendered = JSON.stringify(message);

		expect(rendered).toContain('Suspicious project');
		expect(rendered).toContain('019ff59c-69b3-785a-9618-a2ee6ae323a1');
		expect(rendered).toContain('U12345678');
		expect(rendered).toContain('platform-user-1');
		expect(rendered).toContain('Open project');
	});

	it('uses a stable, distinct UUID for the protected-admin message', () => {
		const reviewId = '019ff59c-69b3-785a-9618-a2ee6ae323a1';
		const clientMessageId = fraudAdminSlackClientMessageId(reviewId);

		expect(clientMessageId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
		);
		expect(clientMessageId).not.toBe(reviewId);
		expect(fraudAdminSlackClientMessageId(reviewId)).toBe(clientMessageId);
	});

	it('bounds escaped project titles to Slack section limits', () => {
		const message = buildFraudAdminSlackMessage({
			projectTitle: '<'.repeat(4_000),
			projectId: 'project-1',
			projectUrl: 'https://example.com/admin/project-1',
			makerSlackId: 'U123',
			makerUserId: 'user-1'
		});
		const details = message.blocks.find((block) => block.type === 'section');

		expect(details?.text.text.length).toBeLessThanOrEqual(3_000);
	});
});
