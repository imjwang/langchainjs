import { clsx, type ClassValue } from 'clsx'
import { customAlphabet } from 'nanoid'
import { twMerge } from 'tailwind-merge'
import { AIMessage, HumanMessage, SystemMessage } from 'langchain/schema'
import type { Message } from 'ai'
import { chunkArray } from '@langchain/core/utils/chunk_array'
import { Document } from 'langchain/document'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
) // 7-character random string

export async function fetcher<JSON = any>(
  input: RequestInfo,
  init?: RequestInit
): Promise<JSON> {
  const res = await fetch(input, init)

  if (!res.ok) {
    const json = await res.json()
    if (json.error) {
      const error = new Error(json.error) as Error & {
        status: number
      }
      error.status = res.status
      throw error
    } else {
      throw new Error('An unexpected error occurred')
    }
  }

  return res.json()
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

export function formatMessage(message: Message) {
  if (message.role === 'system') {
    return new SystemMessage(message.content)
  } else if (message.role === 'user') {
    return new HumanMessage(message.content)
  } else {
    return new AIMessage(message.content)
  }
}

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import type { TaskType, EmbedContentRequest } from '@google/generative-ai'
import { getEnvironmentVariable } from '@langchain/core/utils/env'
import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings'

/**
 * Interface that extends EmbeddingsParams and defines additional
 * parameters specific to the GoogleGenerativeAIEmbeddings class.
 */
export interface GoogleGenerativeAIEmbeddingsParams extends EmbeddingsParams {
  /**
   * Model Name to use
   *
   * Note: The format must follow the pattern - `{model}`
   */
  modelName?: string

  /**
   * Type of task for which the embedding will be used
   *
   * Note: currently only supported by `embedding-001` model
   */
  taskType?: TaskType

  /**
   * An optional title for the text. Only applicable when TaskType is
   * `RETRIEVAL_DOCUMENT`
   *
   * Note: currently only supported by `embedding-001` model
   */
  title?: string

  /**
   * Whether to strip new lines from the input text. Default to true
   */
  stripNewLines?: boolean

  /**
   * Google API key to use
   */
  apiKey?: string
}

/**
 * Class that extends the Embeddings class and provides methods for
 * generating embeddings using the Google Palm API.
 * @example
 * ```typescript
 * const model = new GoogleGenerativeAIEmbeddings({
 *   apiKey: "<YOUR API KEY>",
 *   modelName: "embedding-001",
 * });
 *
 * // Embed a single query
 * const res = await model.embedQuery(
 *   "What would be a good company name for a company that makes colorful socks?"
 * );
 * console.log({ res });
 *
 * // Embed multiple documents
 * const documentRes = await model.embedDocuments(["Hello world", "Bye bye"]);
 * console.log({ documentRes });
 * ```
 */
export class GoogleGenerativeAIEmbeddings
  extends Embeddings
  implements GoogleGenerativeAIEmbeddingsParams
{
  apiKey?: string

  modelName = 'embedding-001'

  taskType?: TaskType

  title?: string

  stripNewLines = true

  maxBatchSize = 100

  private client: GenerativeModel

  constructor(fields?: GoogleGenerativeAIEmbeddingsParams) {
    super(fields ?? {})

    this.modelName =
      fields?.modelName?.replace(/^models\//, '') ?? this.modelName

    this.taskType = fields?.taskType ?? this.taskType

    this.title = fields?.title ?? this.title

    if (this.title && this.taskType !== 'RETRIEVAL_DOCUMENT') {
      throw new Error(
        'title can only be sepcified with TaskType.RETRIEVAL_DOCUMENT'
      )
    }

    this.apiKey = fields?.apiKey ?? getEnvironmentVariable('GOOGLE_API_KEY')
    if (!this.apiKey) {
      throw new Error(
        'Please set an API key for Google GenerativeAI ' +
          'in the environmentb variable GOOGLE_API_KEY ' +
          'or in the `apiKey` field of the ' +
          'GoogleGenerativeAIEmbeddings constructor'
      )
    }

    this.client = new GoogleGenerativeAI(this.apiKey).getGenerativeModel({
      model: this.modelName
    })
  }

  private _convertToContent(text: string): EmbedContentRequest {
    const cleanedText = this.stripNewLines ? text.replace(/\n/g, ' ') : text
    return {
      content: { role: 'user', parts: [{ text: cleanedText }] },
      taskType: this.taskType,
      title: this.title
    }
  }

  protected async _embedQueryContent(text: string): Promise<number[]> {
    const req = this._convertToContent(text)
    const res = await this.client.embedContent(req)
    return res.embedding.values ?? []
  }

  protected async _embedDocumentsContent(
    documents: string[]
  ): Promise<number[][]> {
    const batchEmbedChunks = chunkArray(documents, this.maxBatchSize)

    const batchEmbedRequests = batchEmbedChunks.map(chunk => ({
      requests: chunk.map(doc => this._convertToContent(doc))
    }))

    const responses = await Promise.allSettled(
      batchEmbedRequests.map(req => this.client.batchEmbedContents(req))
    )

    const embeddings = responses.flatMap((res, idx) => {
      if (res.status === 'fulfilled') {
        return res.value.embeddings.map(e => e.values || [])
      } else {
        return Array(batchEmbedChunks[idx].length).fill([])
      }
    })

    return embeddings
  }

  /**
   * Method that takes a document as input and returns a promise that
   * resolves to an embedding for the document. It calls the _embedText
   * method with the document as the input.
   * @param document Document for which to generate an embedding.
   * @returns Promise that resolves to an embedding for the input document.
   */
  embedQuery(document: string): Promise<number[]> {
    return this.caller.call(this._embedQueryContent.bind(this), document)
  }

  /**
   * Method that takes an array of documents as input and returns a promise
   * that resolves to a 2D array of embeddings for each document. It calls
   * the _embedText method for each document in the array.
   * @param documents Array of documents for which to generate embeddings.
   * @returns Promise that resolves to a 2D array of embeddings for each input document.
   */
  embedDocuments(documents: string[]): Promise<number[][]> {
    return this.caller.call(this._embedDocumentsContent.bind(this), documents)
  }
}

export class SupabaseDocstore {
  private client: SupabaseClient

  private tableName: string

  constructor(client: SupabaseClient, tableName: string) {
    this.client = client
    this.tableName = tableName
  }

  async mget(ids: string[]) {
    console.log('tablename', this.tableName)
    console.log('ids', ids)
    const { data, error } = await this.client
      .from(this.tableName)
      .select()
      .in('uid', ids)

    console.log('data', data)

    const documents = data.map((row: any) => {
      return new Document({
        pageContent: row.content,
        metadata: {
          source: row.source
        }
      })
    })

    if (error) {
      throw new Error(error.message)
    }

    return documents
  }
}

import { type ClientOptions, OpenAIClient } from '@langchain/openai'
import { StructuredTool } from '@langchain/core/tools'
import { Runnable, RunnableConfig } from '@langchain/core/runnables'
import { formatToOpenAIAssistantTool } from '@langchain/openai'
import { sleep } from 'openai/core.js'

type ThreadMessage = OpenAIClient.Beta.Threads.ThreadMessage
type RequiredActionFunctionToolCall =
  OpenAIClient.Beta.Threads.RequiredActionFunctionToolCall

type ExtractRunOutput<AsAgent extends boolean | undefined> =
  AsAgent extends true
    ? OpenAIAssistantFinish | OpenAIAssistantAction[]
    : ThreadMessage[] | RequiredActionFunctionToolCall[]

export type OpenAIAssistantRunnableInput<
  AsAgent extends boolean | undefined = undefined
> = {
  client?: OpenAIClient
  clientOptions?: ClientOptions
  assistantId: string
  pollIntervalMs?: number
  asAgent?: AsAgent
}

export class OpenAIAssistantRunnable<
  AsAgent extends boolean | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RunInput extends Record<string, any> = Record<string, any>
> extends Runnable<RunInput, ExtractRunOutput<AsAgent>> {
  lc_namespace = ['langchain', 'experimental', 'openai_assistant']

  private client: OpenAIClient

  assistantId: string

  pollIntervalMs = 1000

  asAgent?: AsAgent

  constructor(fields: OpenAIAssistantRunnableInput<AsAgent>) {
    super(fields)
    this.client = fields.client ?? new OpenAIClient(fields?.clientOptions)
    this.assistantId = fields.assistantId
    this.asAgent = fields.asAgent ?? this.asAgent
  }

  static async createAssistant<AsAgent extends boolean>({
    model,
    name,
    instructions,
    tools,
    client,
    clientOptions,
    asAgent,
    pollIntervalMs,
    fileIds
  }: Omit<OpenAIAssistantRunnableInput<AsAgent>, 'assistantId'> & {
    model: string
    name?: string
    instructions?: string
    tools?: OpenAIToolType | Array<StructuredTool>
    fileIds?: string[]
  }) {
    const formattedTools =
      tools?.map(tool => {
        // eslint-disable-next-line no-instanceof/no-instanceof
        if (tool instanceof StructuredTool) {
          return formatToOpenAIAssistantTool(tool)
        }
        return tool
      }) ?? []
    const oaiClient = client ?? new OpenAIClient(clientOptions)
    const assistant = await oaiClient.beta.assistants.create({
      name,
      instructions,
      tools: formattedTools,
      model,
      file_ids: fileIds
    })

    return new this({
      client: oaiClient,
      assistantId: assistant.id,
      asAgent,
      pollIntervalMs
    })
  }

  async invoke(
    input: RunInput,
    _options?: RunnableConfig
  ): Promise<ExtractRunOutput<AsAgent>> {
    let run: OpenAIClient.Beta.Threads.Run
    if (this.asAgent && input.steps && input.steps.length > 0) {
      const parsedStepsInput = await this._parseStepsInput(input)
      run = await this.client.beta.threads.runs.submitToolOutputs(
        parsedStepsInput.threadId,
        parsedStepsInput.runId,
        {
          tool_outputs: parsedStepsInput.toolOutputs
        }
      )
    } else if (!('threadId' in input)) {
      const thread = {
        messages: [
          {
            role: 'user',
            content: input.content,
            file_ids: input.fileIds,
            metadata: input.messagesMetadata
          }
        ],
        metadata: input.threadMetadata
      }
      run = await this._createThreadAndRun({
        ...input,
        thread
      })
    } else if (!('runId' in input)) {
      await this.client.beta.threads.messages.create(input.threadId, {
        content: input.content,
        role: 'user',
        file_ids: input.file_ids,
        metadata: input.messagesMetadata
      })
      run = await this._createRun(input)
    } else {
      // Submitting tool outputs to an existing run, outside the AgentExecutor
      // framework.
      run = await this.client.beta.threads.runs.submitToolOutputs(
        input.threadId,
        input.runId,
        {
          tool_outputs: input.toolOutputs
        }
      )
    }

    return this._getResponse(run.id, run.thread_id)
  }

  /**
   * Delete an assistant.
   *
   * @link {https://platform.openai.com/docs/api-reference/assistants/deleteAssistant}
   * @returns {Promise<AssistantDeleted>}
   */
  public async deleteAssistant() {
    return await this.client.beta.assistants.del(this.assistantId)
  }

  /**
   * Retrieves an assistant.
   *
   * @link {https://platform.openai.com/docs/api-reference/assistants/getAssistant}
   * @returns {Promise<OpenAIClient.Beta.Assistants.Assistant>}
   */
  public async getAssistant() {
    return await this.client.beta.assistants.retrieve(this.assistantId)
  }

  /**
   * Modifies an assistant.
   *
   * @link {https://platform.openai.com/docs/api-reference/assistants/modifyAssistant}
   * @returns {Promise<OpenAIClient.Beta.Assistants.Assistant>}
   */
  public async modifyAssistant<AsAgent extends boolean>({
    model,
    name,
    instructions,
    fileIds
  }: Omit<OpenAIAssistantRunnableInput<AsAgent>, 'assistantId' | 'tools'> & {
    model?: string
    name?: string
    instructions?: string
    fileIds?: string[]
  }) {
    return await this.client.beta.assistants.update(this.assistantId, {
      name,
      instructions,
      model,
      file_ids: fileIds
    })
  }

  private async _parseStepsInput(input: RunInput): Promise<RunInput> {
    const {
      action: { runId, threadId }
    } = input.steps[input.steps.length - 1]
    const run = await this._waitForRun(runId, threadId)
    const toolCalls = run.required_action?.submit_tool_outputs.tool_calls
    if (!toolCalls) {
      return input
    }
    const toolOutputs = toolCalls.flatMap(toolCall => {
      const matchedAction = (
        input.steps as {
          action: OpenAIAssistantAction
          observation: string
        }[]
      ).find(step => step.action.toolCallId === toolCall.id)

      return matchedAction
        ? [
            {
              output: matchedAction.observation,
              tool_call_id: matchedAction.action.toolCallId
            }
          ]
        : []
    })
    return { toolOutputs, runId, threadId } as unknown as RunInput
  }

  private async _createRun({
    instructions,
    model,
    tools,
    metadata,
    threadId
  }: RunInput) {
    const run = this.client.beta.threads.runs.create(threadId, {
      assistant_id: this.assistantId,
      instructions,
      model,
      tools,
      metadata
    })
    return run
  }

  private async _createThreadAndRun(input: RunInput) {
    const params: Record<string, unknown> = [
      'instructions',
      'model',
      'tools',
      'run_metadata'
    ]
      .filter(key => key in input)
      .reduce(
        (obj, key) => {
          const newObj = obj
          newObj[key] = input[key]
          return newObj
        },
        {} as Record<string, unknown>
      )
    const run = this.client.beta.threads.createAndRun({
      ...params,
      thread: input.thread,
      assistant_id: this.assistantId
    })
    return run
  }

  private async _waitForRun(runId: string, threadId: string) {
    let inProgress = true
    let run = {} as OpenAIClient.Beta.Threads.Run
    while (inProgress) {
      run = await this.client.beta.threads.runs.retrieve(threadId, runId)
      inProgress = ['in_progress', 'queued'].includes(run.status)
      if (inProgress) {
        await sleep(this.pollIntervalMs)
      }
    }
    return run
  }

  private async _getResponse(
    runId: string,
    threadId: string
  ): Promise<ExtractRunOutput<AsAgent>>

  private async _getResponse(
    runId: string,
    threadId: string
  ): Promise<
    | OpenAIAssistantFinish
    | OpenAIAssistantAction[]
    | ThreadMessage[]
    | RequiredActionFunctionToolCall[]
  > {
    const run = await this._waitForRun(runId, threadId)
    if (run.status === 'completed') {
      const messages = await this.client.beta.threads.messages.list(threadId, {
        order: 'asc'
      })
      const newMessages = messages.data.filter(msg => msg.run_id === runId)
      if (!this.asAgent) {
        return newMessages
      }
      const answer = newMessages.flatMap(msg => msg.content)
      if (answer.every(item => item.type === 'text')) {
        const answerString = answer
          .map(item => item.type === 'text' && item.text.value)
          .join('\n')
        return {
          returnValues: {
            output: answerString,
            runId,
            threadId
          },
          log: '',
          runId,
          threadId
        }
      }
    } else if (run.status === 'requires_action') {
      if (!this.asAgent) {
        return run.required_action?.submit_tool_outputs.tool_calls ?? []
      }
      const actions: OpenAIAssistantAction[] = []
      run.required_action?.submit_tool_outputs.tool_calls.forEach(item => {
        const functionCall = item.function
        const args = JSON.parse(functionCall.arguments)
        actions.push({
          tool: functionCall.name,
          toolInput: args,
          toolCallId: item.id,
          log: '',
          runId,
          threadId
        })
      })
      return actions
    }
    const runInfo = JSON.stringify(run, null, 2)
    throw new Error(
      `Unexpected run status ${run.status}.\nFull run info:\n\n${runInfo}`
    )
  }
}

// export async _parseStepsInput(input): Promise<any> {
//   const {
//     action: { runId, threadId },
//   } = input.steps[input.steps.length - 1];
//   const run = await this._waitForRun(runId, threadId);
//   const toolCalls = run.required_action?.submit_tool_outputs.tool_calls;
//   if (!toolCalls) {
//     return input;
//   }
//   const toolOutputs = toolCalls.flatMap((toolCall) => {
//     const matchedAction = (
//       input.steps as {
//         action: OpenAIAssistantAction;
//         observation: string;
//       }[]
//     ).find((step) => step.action.toolCallId === toolCall.id);

//     return matchedAction
//       ? [
//           {
//             output: matchedAction.observation,
//             tool_call_id: matchedAction.action.toolCallId,
//           },
//         ]
//       : [];
//   });
//   return { toolOutputs, runId, threadId } as unknown as RunInput;
// }
const t = [
  {
    title: 'Creativity | Psychology Today - Definition, Sources, Tips',
    url: 'https://www.psychologytoday.com/us/basics/creativity',
    content:
      'Learn how creativity involves the discovery of new and original ideas, connections, and solutions to problems. Find out the sources, steps, and benefits of creativity, as well as the links between creativity and the brain, mental health, and everyday life.',
    score: 0.96594,
    raw_content: null
  },
  {
    title: 'Creativity: Definition, Types, Skills, & Facts - Britannica',
    url: 'https://www.britannica.com/topic/creativity',
    content:
      'Creativity is the ability to make or bring into existence something new, whether a solution to a problem, a method or device, or an artistic object or form. Learn about the psychological, social, and cultural factors that influence creativity, as well as the types and skills of creative people and products. Explore examples of creative individuals and their achievements in various fields.',
    score: 0.93387,
    raw_content: null
  },
  {
    title: 'Creativity - Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Creativity',
    content:
      'Creativity is a characteristic of someone or some process that forms something new and valuable. The article explains the etymology, definition, aspects, and conceptual history of creativity in various disciplines and contexts. It also covers the factors that determine how creativity is evaluated and perceived, and the applications of creative resources to improve the effectiveness of teaching and learning.',
    score: 0.93272,
    raw_content: null
  },
  {
    title: 'Why being creative is good for you - BBC',
    url: 'https://www.bbc.com/culture/article/20210105-why-being-creative-is-good-for-you',
    content:
      'Creativity is many things. It is making connections, with yourself or a great other "universal source", connections that create new ideas; it is embracing fear and the inner critic; it is staying ...',
    score: 0.91633,
    raw_content: null
  },
  {
    title:
      'The science behind creativity - American Psychological Association (APA)',
    url: 'https://www.apa.org/monitor/2022/04/cover-science-creativity',
    content:
      'Psychologists and neuroscientists are exploring where creativity comes from and how to increase it in this cover story from the April 2022 issue of Monitor on Psychology. Learn about the latest research on the brain, the process, the traits and the benefits of creativity, and how to measure it in different contexts.',
    score: 0.90119,
    raw_content: null
  }
]
