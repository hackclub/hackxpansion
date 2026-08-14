import { and, eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth.schema';
import { fetchWithTimeout } from '$lib/server/http';

const HACKCLUB_IDENTITY_URL = 'https://auth.hackclub.com/api/v1/me';

export type HackClubAddress = {
	id: string;
	firstName: string;
	lastName: string | null;
	line1: string;
	line2: string | null;
	city: string;
	region: string | null;
	postalCode: string;
	country: string;
	primary: boolean;
};

export type HackClubIdentity = {
	id: string;
	birthday: string;
	addresses: HackClubAddress[];
};

export type HackClubAddressOption = {
	id: string;
	label: string;
	primary: boolean;
};

export type HackClubIdentityErrorCode =
	'reauthorization_required' | 'profile_incomplete' | 'address_not_found' | 'unavailable';

export class HackClubIdentityError extends Error {
	constructor(
		readonly code: HackClubIdentityErrorCode,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'HackClubIdentityError';
	}
}

export async function getHackClubIdentity(userId: string) {
	const [linkedAccount] = await db
		.select({ accountId: account.accountId })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'hackclub')))
		.limit(1);
	if (!linkedAccount) {
		throw new HackClubIdentityError(
			'reauthorization_required',
			'Reconnect Hack Club Auth before submitting.'
		);
	}

	let accessToken: string;
	try {
		({ accessToken } = await auth.api.getAccessToken({
			body: { providerId: 'hackclub', userId }
		}));
	} catch (error) {
		throw new HackClubIdentityError(
			'reauthorization_required',
			'Reconnect Hack Club Auth before submitting.',
			{ cause: error }
		);
	}

	const identity = await fetchHackClubIdentity(accessToken);
	if (identity.id !== linkedAccount.accountId) {
		throw new HackClubIdentityError(
			'reauthorization_required',
			'Hack Club Auth returned a different identity. Reconnect your account.'
		);
	}
	return identity;
}

export async function fetchHackClubIdentity(accessToken: string): Promise<HackClubIdentity> {
	let response: Response;
	try {
		response = await fetchWithTimeout(HACKCLUB_IDENTITY_URL, {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
	} catch (error) {
		throw new HackClubIdentityError(
			'unavailable',
			'Hack Club Auth is temporarily unavailable. Try again shortly.',
			{ cause: error }
		);
	}

	if (response.status === 401 || response.status === 403) {
		throw new HackClubIdentityError(
			'reauthorization_required',
			'Reconnect Hack Club Auth before submitting.'
		);
	}
	if (!response.ok) {
		throw new HackClubIdentityError(
			'unavailable',
			'Hack Club Auth is temporarily unavailable. Try again shortly.'
		);
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch (error) {
		throw new HackClubIdentityError('unavailable', 'Hack Club Auth returned an invalid response.', {
			cause: error
		});
	}
	if (!isRecord(data) || !isRecord(data.identity) || !Array.isArray(data.scopes)) {
		throw new HackClubIdentityError('unavailable', 'Hack Club Auth returned an invalid response.');
	}

	const scopes = new Set(data.scopes.filter((scope): scope is string => typeof scope === 'string'));
	if (!scopes.has('address') || (!scopes.has('birthdate') && !scopes.has('basic_info'))) {
		throw new HackClubIdentityError(
			'reauthorization_required',
			'Reconnect Hack Club Auth to grant address and birthdate access.'
		);
	}

	const id = requiredString(data.identity.id);
	const birthday = validBirthday(data.identity.birthday);
	if (!id || !birthday) {
		throw new HackClubIdentityError(
			'profile_incomplete',
			'Add your birthday to Hack Club Auth before submitting.'
		);
	}

	const rawAddresses = data.identity.addresses;
	if (!Array.isArray(rawAddresses)) {
		throw new HackClubIdentityError(
			'profile_incomplete',
			'Add a complete address to Hack Club Auth before submitting.'
		);
	}
	const addresses = rawAddresses.map(parseAddress).filter((value) => value !== null);
	if (addresses.length === 0) {
		throw new HackClubIdentityError(
			'profile_incomplete',
			'Add a complete address to Hack Club Auth before submitting.'
		);
	}

	return { id, birthday, addresses };
}

export function resolveHackClubAddress(identity: HackClubIdentity, addressId: string) {
	const address = identity.addresses.find((candidate) => candidate.id === addressId);
	if (!address) {
		throw new HackClubIdentityError(
			'address_not_found',
			'Select an address from your current Hack Club Auth profile.'
		);
	}
	return address;
}

export function hackClubAddressOptions(identity: HackClubIdentity): HackClubAddressOption[] {
	return identity.addresses
		.map((address) => ({
			id: address.id,
			primary: address.primary,
			label: formatAddress(address)
		}))
		.sort((left, right) => Number(right.primary) - Number(left.primary));
}

export function hackClubAddressIdFromForm(formData: FormData) {
	const value = formData.get('addressId');
	const addressId = typeof value === 'string' ? value.trim() : '';
	if (!addressId || addressId.length > 200) {
		throw new HackClubIdentityError('address_not_found', 'Select a Hack Club Auth address.');
	}
	return addressId;
}

function parseAddress(value: unknown): HackClubAddress | null {
	if (!isRecord(value)) return null;
	const id = requiredString(value.id);
	const firstName = requiredString(value.first_name);
	const line1 = requiredString(value.line_1);
	const city = requiredString(value.city);
	const postalCode = requiredString(value.postal_code);
	const country = requiredString(value.country);
	if (!id || !firstName || !line1 || !city || !postalCode || !country) return null;

	return {
		id,
		firstName,
		lastName: optionalString(value.last_name),
		line1,
		line2: optionalString(value.line_2),
		city,
		region: optionalString(value.state),
		postalCode,
		country,
		primary: value.primary === true
	};
}

function formatAddress(address: HackClubAddress) {
	const recipient = [address.firstName, address.lastName].filter(Boolean).join(' ');
	const locality = [address.city, address.region, address.postalCode].filter(Boolean).join(', ');
	return [recipient, address.line1, address.line2, locality, address.country]
		.filter(Boolean)
		.join(' | ');
}

function validBirthday(value: unknown) {
	const birthday = requiredString(value);
	if (!birthday) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
	if (!match) return null;
	const [, yearText, monthText, dayText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	const now = new Date();
	const today = [
		now.getUTCFullYear(),
		String(now.getUTCMonth() + 1).padStart(2, '0'),
		String(now.getUTCDate()).padStart(2, '0')
	].join('-');
	if (birthday > today) return null;
	return birthday;
}

function requiredString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown) {
	return requiredString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
