import {
	DeleteParameterCommand,
	GetParametersByPathCommand,
	PutParameterCommand,
	SSMClient,
	type Parameter,
} from '@aws-sdk/client-ssm'
import { paginate } from './paginate.js'

const nameRx = /^[a-zA-Z0-9_.-]+$/

export const settingsPath = ({
	stackName,
	scope,
	context,
	property,
}: {
	stackName: string
	scope: string
	context: string
	property?: string
}): string => {
	if (!nameRx.test(stackName))
		throw new Error(`Invalid stackName value: ${stackName}!`)
	if (!nameRx.test(scope)) throw new Error(`Invalid scope value: ${scope}!`)
	if (!nameRx.test(context))
		throw new Error(`Invalid context value: ${context}!`)

	const parts = [stackName, scope, context]
	if (property !== undefined) {
		if (!nameRx.test(property))
			throw new Error(`Invalid property value: ${property}!`)
		parts.push(property)
	}
	return `/${parts.join('/')}`
}

export const getSettings =
	<Settings extends Record<string, string>>({
		ssm,
		stackName,
		scope,
		context,
	}: {
		ssm: SSMClient
		stackName: string
		scope: string
		context: string
	}) =>
	async (): Promise<Settings> => {
		const Path = settingsPath({ stackName, scope, context })
		const Parameters: Parameter[] = []
		await paginate({
			paginator: async (NextToken?: string) =>
				ssm
					.send(
						new GetParametersByPathCommand({
							Path,
							Recursive: true,
							NextToken,
						}),
					)
					.then(({ Parameters: p, NextToken }) => {
						if (p !== undefined) Parameters.push(...p)
						return NextToken
					}),
		})

		if (Parameters.length === 0)
			throw new Error(`context not configured: ${Path}!`)

		return Parameters.map(({ Name, ...rest }) => ({
			...rest,
			Name: Name?.replace(`${Path}/`, ''),
		})).reduce(
			(settings, { Name, Value }) => ({
				...settings,
				[Name ?? '']: Value ?? '',
			}),
			{} as Settings,
		)
	}

export const putSettings =
	({
		ssm,
		stackName,
		scope,
		context,
	}: {
		ssm: SSMClient
		stackName: string
		scope: string
		context: string
	}) =>
	async ({
		property,
		value,
		deleteBeforeUpdate,
	}: {
		property: string
		value: string
		/**
		 * Useful when depending on the parameter having version 1, e.g. for use in CloudFormation
		 */
		deleteBeforeUpdate?: boolean
	}): Promise<{ name: string }> => {
		const Name = settingsPath({ stackName, scope, context, property })
		if (deleteBeforeUpdate ?? false) {
			try {
				await ssm.send(
					new DeleteParameterCommand({
						Name,
					}),
				)
			} catch {
				// pass
			}
		}
		await ssm.send(
			new PutParameterCommand({
				Name,
				Value: value,
				Type: 'String',
				Overwrite: !(deleteBeforeUpdate ?? false),
			}),
		)
		return { name: Name }
	}

export const deleteSettings =
	({
		ssm,
		stackName,
		scope,
		context,
	}: {
		ssm: SSMClient
		stackName: string
		scope: string
		context: string
	}) =>
	async ({ property }: { property: string }): Promise<{ name: string }> => {
		const Name = settingsPath({ stackName, scope, context, property })
		try {
			await ssm.send(
				new DeleteParameterCommand({
					Name,
				}),
			)
		} catch (error) {
			if ((error as Error).name === 'ParameterNotFound') {
				// pass
			} else {
				throw error
			}
		}
		return { name: Name }
	}

export const getSettingsOptional =
	<Settings extends Record<string, string>, Default>(
		args: Parameters<typeof getSettings>[0],
	) =>
	/**
	 * In case of an unconfigured stack, returns default values
	 */
	async (defaultValue: Default): Promise<Settings | Default> => {
		try {
			return await getSettings<Settings>(args)()
		} catch {
			return defaultValue
		}
	}
