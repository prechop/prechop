export interface IJwtPayload {
	userId: string;
	ip: string;
	accessToken: string;
	refreshToken: string;
	date: Date;
	expiresIn: Date;
	refreshTokenExpiresIn: Date;
}
