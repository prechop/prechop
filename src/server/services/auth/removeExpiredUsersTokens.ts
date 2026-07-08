import { removeExpiredUsersTokensDB } from "../../models";

/** Cron sweep: prune expired embedded refresh tokens across all users. */
export async function removeExpiredUsersTokens(): Promise<boolean> {
	return removeExpiredUsersTokensDB();
}
