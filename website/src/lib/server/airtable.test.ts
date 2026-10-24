import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildYswsProjectSubmissionFields,
	createYswsProjectSubmission,
	updateYswsProjectSubmissionAlternateTracking,
	type YswsProjectApproval
} from './airtable';

const approval: YswsProjectApproval = {
	ariApprovalDeliveryId: 'delivery-1',
	project: {
		repoUrl: 'https://github.com/maker/project',
		demoUrl: 'https://project.example.com',
		thumbnailUrl: 'https://project.example.com/screenshot.png',
		description: 'A useful project.'
	},
	maker: {
		name: 'Ada Lovelace',
		givenName: 'Ada',
		email: 'ada@example.com',
		githubUsername: 'maker',
		birthday: '1815-12-10',
		addressLine1: '1 Computing Lane',
		addressLine2: null,
		addressCity: 'London',
		addressRegion: null,
		addressPostalCode: 'SW1A 1AA',
		addressCountry: 'United Kingdom'
	},
	feedback: {
		howDidYouHear: null,
		whatAreWeDoingWell: 'Fast reviews',
		howCanWeImprove: null
	},
	approvedMinutes: 90,
	justification: {
		hackatime_projects: 'project 7/20/2026-7/22/2026',
		hackatime_user_id: '594',
		lapse_links: 'https://lapse.example.com/one, https://lapse.example.com/two',
		technical_features: 'Custom protocol',
		deflation_reason: 'Existing libraries reduced implementation time.'
	},
	auditNote: 'Fallback reviewer explanation'
};

afterEach(() => vi.unstubAllGlobals());

describe('YSWS Project Submission Airtable export', () => {
	it('maps approval data without setting any automation fields', () => {
		const result = buildYswsProjectSubmissionFields(approval);

		expect(result).toMatchObject({
			fldnLm94WfcThZPhe: 'delivery-1',
			fldZMQYvlbUXYVHVd: 'https://github.com/maker/project',
			fldbZc8K4GdCWhBD6: 'Ada',
			fldVDeiribxpXYeSC: 'Lovelace',
			fld42yfP0pnyc6JqR: 'Fast reviews',
			fldZDzHxDOZdiq04y: '1815-12-10',
			fldsq64DaIPVrhe4e: 1.5,
			fldn65GYnm7Q8mfNE: 'project 7/20/2026-7/22/2026',
			fldVpkqS5o87dqbFq: '594',
			fldjALcVM1u7150Dq: 'https://lapse.example.com/one, https://lapse.example.com/two',
			fld0HvqTvcI429CFa: 'Custom protocol',
			fldxnLY7qf46rqQYS: 'Existing libraries reduced implementation time.',
			fldpsBmCzFJJS0w8C: 'Fallback reviewer explanation'
		});
		expect(result).not.toHaveProperty('fldScjPJRcrBYgRAp');
		expect(result).not.toHaveProperty('fldp3XWKJjES72fWM');
		expect(result).not.toHaveProperty('fldNqi8wSWq5eeDlT');
		expect(result).not.toHaveProperty('fldqEsuO4Kley6aDy');
		expect(Object.keys(result)).not.toContain('fldiuBloMaAPjZDZN');
		expect(Object.keys(result)).not.toContain('fld90tsdUWyDSaSYq');
		expect(Object.keys(result)).not.toContain('fldtfd5xKCpxbLG4V');
		expect(Object.keys(result)).not.toContain('fld2SYcRNyUm57GjH');
	});

	it('omits the hours override when Ari did not provide approved time', () => {
		const result = buildYswsProjectSubmissionFields({ ...approval, approvedMinutes: null });
		expect(result).not.toHaveProperty('fldsq64DaIPVrhe4e');
	});

	it('uses the unified DB record over the audit note', () => {
		const result = buildYswsProjectSubmissionFields({
			...approval,
			justification: {
				...approval.justification,
				unified_db_record: ' Unified DB record '
			},
			auditNote: 'Fallback reviewer explanation'
		});

		expect(result).toHaveProperty('fldpsBmCzFJJS0w8C', 'Unified DB record');
	});

	it('falls back to the audit note when the unified DB record is blank', () => {
		const result = buildYswsProjectSubmissionFields({
			...approval,
			justification: { ...approval.justification, unified_db_record: '   ' },
			auditNote: ' Reviewer explanation '
		});

		expect(result).toHaveProperty('fldpsBmCzFJJS0w8C', 'Reviewer explanation');
	});

	it('uses alternate tracking method for an audit-note-only review', () => {
		const result = buildYswsProjectSubmissionFields({
			...approval,
			justification: null,
			auditNote: ' Reviewer explanation '
		});

		expect(result).toHaveProperty('fldpsBmCzFJJS0w8C', 'Reviewer explanation');
		expect(result).not.toHaveProperty('fldp3XWKJjES72fWM');
		expect(result).not.toHaveProperty('fldScjPJRcrBYgRAp');
		expect(result).not.toHaveProperty('fldNqi8wSWq5eeDlT');
		expect(result).not.toHaveProperty('fldqEsuO4Kley6aDy');
	});

	it('omits alternate tracking method when Ari did not provide a unified DB record or audit note', () => {
		const result = buildYswsProjectSubmissionFields({ ...approval, auditNote: '   ' });

		expect(result).not.toHaveProperty('fldpsBmCzFJJS0w8C');
	});

	it('patches alternate tracking method in batches of ten', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(() =>
				Promise.resolve(new Response(JSON.stringify({ records: [] }), { status: 200 }))
			);
		vi.stubGlobal('fetch', fetchMock);

		const updates = Array.from({ length: 12 }, (_, index) => ({
			deliveryId: `delivery-${index}`,
			recordId: `rec${String(index).padStart(14, '0')}`,
			alternateTrackingMethod: `Alternate tracking method ${index}`
		}));

		await expect(updateYswsProjectSubmissionAlternateTracking(updates, 'pat-secret')).resolves.toBe(
			12
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(firstUrl).toBe('https://api.airtable.com/v0/appdl599Ct1mJBIrV/tblRSGunS3aJP94zf');
		expect(firstInit.method).toBe('PATCH');
		expect(new Headers(firstInit.headers).get('Authorization')).toBe('Bearer pat-secret');
		const firstBody = JSON.parse(String(firstInit.body));
		expect(firstBody.records).toHaveLength(10);
		expect(firstBody.records[0]).toEqual({
			id: 'rec00000000000000',
			fields: { fldpsBmCzFJJS0w8C: 'Alternate tracking method 0' }
		});

		const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
		const secondBody = JSON.parse(String(secondInit.body));
		expect(secondBody.records).toHaveLength(2);
	});

	it('requires an Airtable token to patch alternate tracking', async () => {
		await expect(updateYswsProjectSubmissionAlternateTracking([], undefined)).rejects.toThrow(
			'AIRTABLE_PAC is not configured'
		);
	});

	it('posts one record to the existing YSWS Project Submission table', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ records: [{ id: 'recAirtableRecord' }] }), { status: 200 })
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(createYswsProjectSubmission(approval, 'pat-secret')).resolves.toBe(
			'recAirtableRecord'
		);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.airtable.com/v0/appdl599Ct1mJBIrV/tblRSGunS3aJP94zf');
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer pat-secret');
		expect(init.method).toBe('PATCH');
		const body = JSON.parse(String(init.body));
		expect(body.performUpsert).toEqual({
			fieldsToMergeOn: ['Ari Approval Delivery ID']
		});
		expect(body.records).toHaveLength(1);
	});
});
