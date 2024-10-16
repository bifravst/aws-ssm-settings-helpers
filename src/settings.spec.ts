import type { SSMClient } from '@aws-sdk/client-ssm'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { get, maybe, settingsPath } from './settings.js'

void describe('maybe()', () => {
	void it('should return the given default value if parameter does not exist', async () => {
		const stackConfig = await maybe({
			send: async () => Promise.resolve({ Parameters: undefined }),
		} as unknown as SSMClient)<Record<string, string>>({
			stackName: 'STACK_NAME',
			scope: 'stack',
			context: 'context',
		})
		assert.equal(stackConfig, null)
	})
})

void describe('settingsPath()', () => {
	void it('should produce a fully qualified parameter name', () =>
		assert.equal(
			settingsPath({
				scope: 'stack',
				context: 'context',
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
			'/hello-nrfcloud/stack/context/someProperty',
		))

	void it('should produce a fully qualified parameter name (without a context)', () =>
		assert.equal(
			settingsPath({
				scope: 'stack',
				stackName: 'hello-nrfcloud',
			}),
			'/hello-nrfcloud/stack',
		))

	void it('should not allow parameter without context', () =>
		assert.throws(
			() =>
				settingsPath({
					scope: 'stack',
					stackName: 'hello-nrfcloud',
					property: 'foo',
				} as any),
			/Missing context!/,
		))

	void it('should produce a fully qualified parameter name for valid string scope', () =>
		assert.equal(
			settingsPath({
				scope: 'thirdParty',
				context: 'elite',
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
			'/hello-nrfcloud/thirdParty/elite/someProperty',
		))

	void it('should error for invalid string scope', () => {
		assert.throws(() =>
			settingsPath({
				scope: 'thirdParty',
				context: 'el ite',
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
		)
	})
})

void describe('get()', () => {
	void it('should return the object with same scope', async () => {
		const returnedValues = [
			{
				Name: `/hello-nrfcloud/stack/context/key1`,
				Value: 'value1',
			},
			{
				Name: `/hello-nrfcloud/stack/context/key2`,
				Value: 'value2',
			},
			{
				Name: `/hello-nrfcloud/stack/context/key3`,
				Value: 'value3',
			},
		]

		const stackConfig = get({
			send: async () => Promise.resolve({ Parameters: returnedValues }),
		} as unknown as SSMClient)({
			stackName: 'hello-nrfcloud',
			scope: 'stack',
			context: 'context',
		})

		const result = await stackConfig()
		assert.deepEqual(result, {
			key1: 'value1',
			key2: 'value2',
			key3: 'value3',
		})
	})

	void it('should throw ContextNotConfiguredError if no parameters are found', async () => {
		const stackConfig = get({
			send: async () => Promise.resolve({ Parameters: [] }),
		} as unknown as SSMClient)({
			stackName: 'hello-nrfcloud',
			scope: 'stack',
			context: 'context',
		})

		await assert.rejects(async () => stackConfig(), /ContextNotConfiguredError/)
	})
})
