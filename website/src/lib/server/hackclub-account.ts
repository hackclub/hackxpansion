import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth.schema';

export async function getHackClubAccount(userId: string) {
	const [linkedAccount] = await db
		.select({ id: account.id, accountId: account.accountId })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'hackclub')))
		.limit(1);

	return linkedAccount ?? null;
}
