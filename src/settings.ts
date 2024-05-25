import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	DeleteParameterCommand,
	GetParametersByPathCommand,
	PutParameterCommand,
	type Parameter,
} from '@aws-sdk/client-ssm'
import { paginate } from './paginate.js'

const nameRx = /^[a-zA-Z0-9_.-]+$/

type ParameterNameArgs =
	| { stackName: string; scope: string }
	| { stackName: string; scope: string; context: string }
	| {
			stackName: string
			scope: string
			context: string
			property: string
	  }

export const settingsPath = (args: ParameterNameArgs): string => {
	const { stackName, scope } = args
	if (!nameRx.test(stackName))
		throw new Error(`Invalid stackName value: ${stackName}!`)
	if (!nameRx.test(scope)) throw new Error(`Invalid scope value: ${scope}!`)

	const parts = [stackName, scope]

	if ('context' in args) {
		if (!nameRx.test(args.context))
			throw new Error(`Invalid context value: ${args.context}!`)
		parts.push(args.context)
	}

	if ('property' in args) {
		if (!('context' in args)) throw new Error(`Missing context!`)
		if (!nameRx.test(args.property))
			throw new Error(`Invalid property value: ${args.property}!`)
		parts.push(args.property)
	}

	return `/${parts.join('/')}`
}

export const get =
	(ssm: SSMClient) =>
	<Settings extends Record<string, string>>({
		stackName,
		...nameParams
	}: {
		stackName: string
	} & ParameterNameArgs) =>
	async (): Promise<Settings> => {
		const Path = settingsPath({ stackName, ...nameParams })
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

export const put =
	(ssm: SSMClient) =>
	({
		stackName,
		scope,
		context,
	}: {
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

export const remove =
	(ssm: SSMClient) =>
	({
		stackName,
		scope,
		context,
	}: {
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

export const maybe =
	(ssm: SSMClient) =>
	/**
	 * In case of an unconfigured stack, returns default values
	 */
	async <Settings extends Record<string, string>>(
		args: ParameterNameArgs,
	): Promise<Settings | null> => {
		try {
			return await get(ssm)<Settings>(args)()
		} catch {
			return null
		}
	}
