import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { inferGithubUsername, type UserSubmissionProfile } from '$lib/profile';
import { eq } from 'drizzle-orm';

export type UserProfileFormValues = Record<keyof UserSubmissionProfile, string>;

export class UserProfileValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UserProfileValidationError';
	}
}

export async function getUserSubmissionProfile(userId: string): Promise<UserSubmissionProfile> {
	const [profile] = await db
		.select({
			githubUsername: user.githubUsername
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!profile) throw new UserProfileValidationError('User profile not found.');
	return profile;
}

export function userProfileFormValues(formData: FormData): UserProfileFormValues {
	return {
		githubUsername: stringFromForm(formData, 'githubUsername')
	};
}

export function userProfileInputFromForm(
	formData: FormData,
	options: { repoUrl?: string | null } = {}
): UserSubmissionProfile {
	const values = userProfileFormValues(formData);
	const profile = {
		githubUsername: optionalValue(values.githubUsername, 39, 'GitHub username')
	} satisfies UserSubmissionProfile;

	profile.githubUsername ??= inferGithubUsername(options.repoUrl);
	if (profile.githubUsername && !/^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/.test(profile.githubUsername)) {
		throw new UserProfileValidationError('Enter a valid GitHub username.');
	}

	return profile;
}

export async function updateUserSubmissionProfile(userId: string, profile: UserSubmissionProfile) {
	await db.update(user).set(profile).where(eq(user.id, userId));
}

function optionalValue(value: string, maxLength: number, label: string) {
	const normalized = value.trim();
	if (normalized.length > maxLength) {
		throw new UserProfileValidationError(`${label} must be ${maxLength} characters or fewer.`);
	}
	return normalized || null;
}

function stringFromForm(formData: FormData, key: string) {
	const value = formData.get(key);
	return typeof value === 'string' ? value : '';
}
