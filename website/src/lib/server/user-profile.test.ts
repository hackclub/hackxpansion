import { describe, expect, it } from 'vitest';
import { userProfileInputFromForm, UserProfileValidationError } from './user-profile';

function profileForm(values: Record<string, string> = {}) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(values)) formData.set(key, value);
	return formData;
}

describe('user submission profile', () => {
	it('stores only a normalized GitHub username', () => {
		expect(
			userProfileInputFromForm(
				profileForm({
					githubUsername: ' maker ',
					birthday: '2000-02-29',
					addressLine1: '1 Private Lane'
				})
			)
		).toEqual({ githubUsername: 'maker' });
	});

	it('validates the GitHub username', () => {
		expect(() =>
			userProfileInputFromForm(profileForm({ githubUsername: '-invalid-' }))
		).toThrowError(new UserProfileValidationError('Enter a valid GitHub username.'));
	});
});
