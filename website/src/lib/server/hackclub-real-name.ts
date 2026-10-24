import { auth } from '$lib/server/auth';
import { getHackClubAccount } from '$lib/server/hackclub-account';
import { fetchHackClubRealName as fetchRealNameFromToken } from '$lib/server/hackclub-profile';

export async function fetchHackClubRealName(userId: string) {
	const linkedAccount = await getHackClubAccount(userId);
	if (!linkedAccount) throw new Error('Hack Club account is not linked');

	const { accessToken } = await auth.api.getAccessToken({
		body: { accountId: linkedAccount.id, userId }
	});
	return fetchRealNameFromToken(accessToken);
}
