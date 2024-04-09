export const isNullOrUndefined = (arg?: unknown): arg is null | undefined =>
	arg === undefined || arg === null
