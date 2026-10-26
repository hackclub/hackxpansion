import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { genericOAuth } from 'better-auth/plugins';
import { base } from '$app/paths';
import { fetchHackClubProfile, mapHackClubProfile } from '$lib/server/hackclub-profile';

// The Hack Club Auth app is registered with the callback path used by
// better-auth's genericOAuth plugin before 1.7. Keep using that URI and
// forward it to the current callback route until the app registration is
// updated in the Hack Club Auth developer dashboard.
export const hackClubLegacyCallbackPath = `${base}/api/auth/oauth2/callback/hackclub`;
const hackClubLegacyRedirectURI = new URL(hackClubLegacyCallbackPath, env.ORIGIN).toString();

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	basePath: `${base}/api/auth`,
	trustedOrigins: [env.ORIGIN, env.ORIGIN.replace('https://', 'http://')],
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	account: {
		encryptOAuthTokens: true
	},
	databaseHooks: {
		account: {
			create: {
				before: async (account) => ({ data: { ...account, idToken: null } })
			},
			update: {
				before: async (account) => ({ data: { ...account, idToken: null } })
			}
		}
	},
	user: {
		fields: {
			name: 'displayName'
		},
		additionalFields: {
			currency: {
				type: 'number',
				required: true,
				defaultValue: 0,
				input: false
			},
			isAdmin: {
				type: 'boolean',
				required: true,
				defaultValue: false,
				input: false,
				returned: false
			},
			slackId: {
				type: 'string',
				required: true
			},
			verificationStatus: {
				type: 'string',
				required: true
			},
			yswsEligible: {
				type: 'boolean',
				required: true
			},
			pronouns: {
				type: 'string',
				required: false
			},
			profileCheckedAt: {
				type: 'date',
				required: false,
				returned: false
			},
			githubUsername: {
				type: 'string',
				required: false
			}
		}
	},
	plugins: [
		genericOAuth({
			config: [
				{
					providerId: 'hackclub',
					discoveryUrl: 'https://auth.hackclub.com/.well-known/openid-configuration',
					clientId: env.HACKCLUB_CLIENT_ID,
					clientSecret: env.HACKCLUB_CLIENT_SECRET,
					redirectURI: hackClubLegacyRedirectURI,
					// Hack Club Auth does not advertise PKCE support; better-auth 1.7 enables it by default.
					pkce: false,
					overrideUserInfo: true,
					scopes: [
						'openid',
						'email',
						'name',
						'profile',
						'birthdate',
						'address',
						'verification_status',
						'slack_id'
					],
					getUserInfo: (tokens) =>
						tokens.accessToken
							? fetchHackClubProfile(tokens.accessToken, env.SLACK_BOT_TOKEN)
							: Promise.resolve(null),
					mapProfileToUser: (profile) => {
						const mapped = mapHackClubProfile(profile);
						return { ...mapped, image: mapped.image ?? undefined };
					}
				}
			]
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
