import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	fetchHackClubIdentity,
	hackClubAddressIdFromForm,
	hackClubAddressOptions,
	HackClubIdentityError,
	resolveHackClubAddress
} from './hackclub-identity';

const response = {
	identity: {
		id: 'ident!example',
		birthday: '2005-06-15',
		addresses: [
			{
				id: 'addr!secondary',
				first_name: 'Private',
				last_name: 'Person',
				line_1: '2 Secondary Street',
				city: 'New York',
				state: 'NY',
				postal_code: '10001',
				country: 'US',
				phone_number: '+15555550101',
				primary: false
			},
			{
				id: 'addr!primary',
				first_name: 'Private',
				last_name: 'Person',
				line_1: '1 Primary Street',
				line_2: 'Apartment 2',
				city: 'Boston',
				state: 'MA',
				postal_code: '02108',
				country: 'US',
				phone_number: '+15555550102',
				primary: true
			}
		]
	},
	scopes: ['openid', 'address', 'birthdate']
};

afterEach(() => vi.unstubAllGlobals());

describe('Hack Club identity API', () => {
	it('uses bearer authentication and parses only the required identity fields', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json(response));
		vi.stubGlobal('fetch', fetchMock);

		const identity = await fetchHackClubIdentity('oauth-token');

		expect(identity).toEqual({
			id: 'ident!example',
			birthday: '2005-06-15',
			addresses: [
				expect.objectContaining({ id: 'addr!secondary', line1: '2 Secondary Street' }),
				expect.objectContaining({ id: 'addr!primary', line1: '1 Primary Street' })
			]
		});
		expect(JSON.stringify(identity)).not.toContain('phone_number');
		expect(JSON.stringify(identity)).not.toContain('+155555501');
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://auth.hackclub.com/api/v1/me');
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer oauth-token');
	});

	it('requires address and birthdate scopes', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ ...response, scopes: ['openid', 'address'] }))
		);

		await expect(fetchHackClubIdentity('oauth-token')).rejects.toMatchObject({
			code: 'reauthorization_required'
		});
	});

	it('accepts basic_info as the reported birthday scope', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					Response.json({ ...response, scopes: ['openid', 'address', 'basic_info'] })
				)
		);

		await expect(fetchHackClubIdentity('oauth-token')).resolves.toMatchObject({
			birthday: '2005-06-15'
		});
	});

	it.each(['2005-02-29', '2999-01-01'])('rejects invalid birthday %s', async (birthday) => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					...response,
					identity: { ...response.identity, birthday }
				})
			)
		);

		await expect(fetchHackClubIdentity('oauth-token')).rejects.toMatchObject({
			code: 'profile_incomplete'
		});
	});

	it('returns primary-first selector data without birthday or phone numbers', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)));
		const options = hackClubAddressOptions(await fetchHackClubIdentity('oauth-token'));

		expect(options[0]).toMatchObject({ id: 'addr!primary', primary: true });
		expect(JSON.stringify(options)).not.toContain('2005-06-15');
		expect(JSON.stringify(options)).not.toContain('+155555501');
	});

	it('requires the submitted address ID to belong to the identity', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)));
		const identity = await fetchHackClubIdentity('oauth-token');

		expect(resolveHackClubAddress(identity, 'addr!primary').line1).toBe('1 Primary Street');
		expect(() => resolveHackClubAddress(identity, 'addr!forged')).toThrowError(
			HackClubIdentityError
		);
	});

	it('accepts only a bounded nonempty address ID from forms', () => {
		const formData = new FormData();
		formData.set('addressId', ' addr!primary ');
		expect(hackClubAddressIdFromForm(formData)).toBe('addr!primary');

		formData.set('addressId', '');
		expect(() => hackClubAddressIdFromForm(formData)).toThrowError(HackClubIdentityError);
	});
});
