import { ChatOpenAI } from '@langchain/openai'
import { TavilySearchResults } from '@langchain/community/tools/tavily_search'
import { ToolExecutor } from '@langchain/langgraph/prebuilt'
import { convertToOpenAIFunction } from '@langchain/core/utils/function_calling'
import { BaseMessage, HumanMessage } from '@langchain/core/messages'
import { AgentAction } from '@langchain/core/agents'
import { StateGraph, END } from '@langchain/langgraph'
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables'
import {
  BytesOutputParser,
  StringOutputParser
} from '@langchain/core/output_parsers'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  AgentExecutor,
  AgentStep,
  createOpenAIToolsAgent
} from 'langchain/agents'
import { formatMessage } from '@/lib/utils'
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate
} from '@langchain/core/prompts'
import { RunnableWithMessageHistory } from '@langchain/core/runnables'
import { StreamingTextResponse } from 'ai'
import { RemoteRunnable } from '@langchain/core/runnables/remote'
import { ChatMessageHistory } from 'langchain/memory'
import { OpenAIFunctionsAgentOutputParser } from 'langchain/agents/openai/output_parser'
import { formatToOpenAIFunctionMessages } from 'langchain/agents/format_scratchpad'
import { z } from 'zod'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { getHydeChain, getParentDocumentsChain } from '@/lib/chains'
import { MessageContentText } from 'openai/resources/beta/threads/messages/messages'
import { OpenAIAssistantRunnable } from '@/lib/utils'
import { experimental_AssistantResponse as AssistantResponse } from 'ai'
import Exa from 'exa-js'
import { ExaRetriever } from '@langchain/exa'
import {
  JsonOutputFunctionsParser,
  JsonOutputKeyToolsParser
} from 'langchain/output_parsers'
import { createRetrieverTool } from 'langchain/tools/retriever'
import { type RunnableConfig } from '@langchain/core/runnables'
import { RunnablePassthrough } from 'langchain/schema/runnable'
import { formatDocumentsAsString } from 'langchain/util/document'

// export const runtime = 'edge'

type FunctionMessage = {
  tool: string
  toolInput: any
  toolCallId: string
  log: string
  runId: string
  threadId: string
}

type ToolCall = {
  tool_call_id: string
  output: string
}

// const prompt = PromptTemplate.fromTemplate(
//   `Please provide general health advice to answer the user's question. \
// Let's think through our response as it's very important for the user. \
// Use a combination of Tools to retrieve the gather the most possible information. \
// Use the most relevant information from the podcast to answer.`
// )

const model = new ChatOpenAI({
  modelName: 'gpt-3.5-turbo-0125'
})

const gpt4model = new ChatOpenAI({
  modelName: 'gpt-4-0125-preview'
})

const exaClient = new Exa()

const summarizationPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `Summarize the document. Pay close attention to any keywords and facts.`
  ],
  [
    'human',
    `Document:
{document}

Summarize the document with a concise paragraph. Only include the most important concepts, takeaways, and any actionable advice.`
  ]
])

const summarizationChain = summarizationPrompt
  .pipe(gpt4model)
  .pipe(new StringOutputParser())

async function getExaResults(options: { k: number; query: string }) {
  if (options.k)
    const retriever = new ExaRetriever({
      client: exaClient,
      searchArgs: {
        numResults: options.k,
        useAutoprompt: true
      }
    })

  const searchResults = await retriever.getRelevantDocuments(options.query)
  const searchDocuments = searchResults.map(doc => ({
    document: doc.pageContent
  }))
  const summaries = await summarizationChain.batch(searchDocuments)

  return JSON.stringify({ summaries, rawText: searchDocuments })
}

const exaSearchTool = new DynamicStructuredTool({
  name: 'search',
  description: `Get the contents of a webpage given a string search query. Returns k results.`,
  schema: z.object({
    k: z.number(),
    query: z.string()
  }),
  func: async ({ k, query }) => await getExaResults({ k, query })
})

const searchTool = [exaSearchTool]

const searchModel = model.bind({
  tools: [searchTool.map(convertToOpenAITool)[0]],
  tool_choice: {
    type: 'function',
    function: { name: 'search' }
  }
})

const searchPrompt =
  PromptTemplate.fromTemplate(`Using the user question please search for {k} documents.
Question:
{question}
`)

const searchChain = RunnableSequence.from([
  searchPrompt,
  searchModel,
  aiMessage => aiMessage.toDict(),
  async functionCall =>
    await toolExecutor.invoke({
      tool: functionCall.data.additional_kwargs.tool_calls[0].function.name,
      toolInput: JSON.parse(
        functionCall.data.additional_kwargs.tool_calls[0].function.arguments
      )
    }),
  searchResults => JSON.parse(searchResults)
])

async function retrieveHubermanSummaries(question: string) {
  const hydeChain = await getHydeChain(10, 20)
  const summaries = await hydeChain.invoke({ question })
  return summaries
}

async function retrieveHubermanTranscripts(question: string) {
  const hubermanParentDocumentsChain = await getParentDocumentsChain(
    40,
    'huberman'
  )
  const transcripts = await hubermanParentDocumentsChain.invoke({ question })
  return transcripts
}

async function healthAdviceRetriever(question: string) {
  const summaries = await retrieveHubermanSummaries(question)
  const transcripts = await retrieveHubermanTranscripts(question)
  return JSON.stringify({ summaries, transcripts })
}

const healthKnowledgeRetrievalTool = new DynamicStructuredTool({
  name: 'retrieve_health_knowledge',
  description: `Retrieves important details from The Huberman Lab podcast which is a show hosted by Dr. Andrew Huberman, a neuroscientist and professor at Stanford University. \
The podcast focuses on neuroscience and biology, aiming to provide listeners with practical tools derived from scientific research that can improve various aspects of life, \
such as health, performance, and well-being.`,
  schema: z.object({
    question: z
      .string()
      .describe(
        'Question to use as a query. Please generate a specific question that helps the user with their question.'
      )
  }),
  func: async ({ question }) => await healthAdviceRetriever(question)
})

const retrievalTool = [healthKnowledgeRetrievalTool]

const retrievalModel = model.bind({
  tools: retrievalTool.map(convertToOpenAITool),
  tool_choice: {
    type: 'function',
    function: { name: 'retrieve_health_knowledge' }
  }
})

const toolExecutor = new ToolExecutor({
  tools: [...retrievalTool, ...searchTool]
})

const retrievalChain = RunnableSequence.from([
  retrievalModel,
  aiMessage => aiMessage.toDict(),
  async functionCall =>
    await toolExecutor.invoke({
      tool: functionCall.data.additional_kwargs.tool_calls[0].function.name,
      toolInput: JSON.parse(
        functionCall.data.additional_kwargs.tool_calls[0].function.arguments
      )
    }),
  retrievals => JSON.parse(retrievals)
])

const relevancyJSONPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `Given the user message, label the provided document as "relevant" to generating a response or not using JSON format.`
  ],
  [
    'human',
    `Please label the following.
Question:
{question}

Document:
{document}

Make sure to output a boolean.`
  ]
])

const jsonModel = model.bind({
  response_format: { type: 'json_object' }
})

const relevancyJSONChain = RunnableSequence.from([
  relevancyJSONPrompt,
  jsonModel,
  new StringOutputParser(),
  outputs => JSON.parse(outputs)
])

const extractionPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `Construct a detailed document to prepare a qualified medical practictioner to give medical advice.`
  ],
  [
    'human',
    `My patient is looking for health advice. I have a summary that contains relevant information. However, it is too vague. Please go through \
the transcripts and extract specific supporting details for the summary. Return a short list of the most important topics along with their respective supporting details.

Summary:
{summary}

Transcripts:
{transcripts}
    
Let's think through our response as it's very important for the wellness of my patient. Make sure to only include details that support the summary and discard any irrelevant details.`
  ]
])

const extractionChain = RunnableSequence.from([
  extractionPrompt,
  gpt4model,
  new StringOutputParser()
])

async function processRetrievals(summaries: string, question: string) {
  const formattedSummaries: Array<string> = summaries.split('\n')
  const relevancyInputs = formattedSummaries.map(summary => {
    return {
      question,
      document: summary
    }
  })
  const results = await relevancyJSONChain.batch(relevancyInputs)
  const filteredResults = results.reduce((acc, current, idx) => {
    if (current.relevant) {
      acc.push(formattedSummaries[idx])
    }
    return acc
  }, [] as Array<string>)

  return {
    filteredResults,
    filterCount: formattedSummaries.length - filteredResults.length
  }
}

type SearchDocument = {
  document: string
}

type SearchResults = {
  summaries: Array<string>
  rawText: Array<SearchDocument>
}

function mergeTranscripts({
  transcripts,
  searchResults
}: {
  transcripts: string
  searchResults: SearchResults
}) {
  const { rawText } = searchResults
  const searchDocuments = rawText.map(result => result.document)
  const searchDocumentsString = searchDocuments.join('\n')
  const newTranscripts = transcripts + '\n' + searchDocumentsString
  return newTranscripts
}

function mergeSummaries({ summaries, searchResults }: any) {
  const { summaries: searchSummaries } = searchResults
  const newSummaries = [...searchSummaries, ...summaries]
  return newSummaries
}

async function extract({
  transcripts,
  summaries
}: {
  summaries: Array<string>
  transcripts: string
}) {
  const extractionInputs = summaries.map(summary => {
    return {
      summary,
      transcripts
    }
  })
  return await extractionChain.batch(extractionInputs)
}

const selfReflectiveChain = RunnableSequence.from([
  {
    retrievals: retrievalChain,
    question: new RunnablePassthrough()
  },
  {
    filteredSummaries: async ({ retrievals, question }) =>
      await processRetrievals(retrievals.summaries, question),
    question: ({ question }) => question,
    transcripts: ({ retrievals }) => retrievals.transcripts
  },
  {
    k: ({ filteredSummaries }) => filteredSummaries.filterCount,
    question: ({ question }) => question,
    summaries: ({ filteredSummaries }) => filteredSummaries.filteredResults,
    transcripts: ({ transcripts }) => transcripts
  },
  {
    searchResults: searchChain,
    summaries: ({ summaries }) => summaries,
    transcripts: ({ transcripts }) => transcripts
  },
  {
    transcripts: ({ searchResults, transcripts }) =>
      mergeTranscripts({ searchResults, transcripts }),
    summaries: ({ searchResults, summaries }) =>
      mergeSummaries({ searchResults, summaries })
  },
  async ({ summaries, transcripts }) =>
    await extract({ summaries, transcripts }),
  (documents: Array<string>) => documents.join('\n')
])

const selfReflectiveTool = new DynamicStructuredTool({
  name: 'retrieve_health_advice',
  description: `Retrieves documents from The Huberman Lab podcast which is a show hosted by Dr. Andrew Huberman, a neuroscientist and professor at Stanford University. \
The podcast focuses on neuroscience and biology, aiming to provide listeners with practical tools derived from scientific research that can improve various aspects of life, \
such as health, performance, and well-being.`,
  schema: z.object({
    question: z.string()
  }),
  func: async ({ question }) => await selfReflectiveChain.invoke(question)
})

async function retrieveLexTranscripts(question: string) {
  const lexParentDocumentsChain = await getParentDocumentsChain(40, 'lex')
  const transcripts = await lexParentDocumentsChain.invoke({ question })
  return transcripts
}

const engineeringKnowledgeRetrievalTool = new DynamicStructuredTool({
  name: 'retrieve_engineering_advice',
  description: `Retrieves important details from the Lex Fridman podcast which is a show hosted by Lex Fridman, a research scientist at MIT working on human-centered AI and autonomous vehicles. \
The podcast focuses on artificial intelligence, autonomous vehicles, and the future of humanity.`,
  schema: z.object({
    question: z.string()
  }),
  func: async ({ question }) => retrieveLexTranscripts(question)
})

export async function POST(req: Request) {
  const tools = [
    new TavilySearchResults({
      maxResults: 5
    }),
    engineeringKnowledgeRetrievalTool,
    selfReflectiveTool
  ]

  const agentToolExecutor = new ToolExecutor({
    tools
  })

  const agentState = {
    threadId: {
      value: (x: string, y: string) => y,
      default: () => ''
    },
    toolCallId: {
      value: (x: string, y: string) => y,
      default: () => ''
    },
    message: {
      value: (
        x: Array<BaseMessage> | Array<FunctionMessage> | Array<ToolCall>,
        y: Array<BaseMessage> | Array<FunctionMessage> | Array<ToolCall>
      ) => y,
      default: () => {}
    },
    runId: {
      value: (x: string, y: string) => y,
      default: () => ''
    },
    question: {
      value: (x: string, y: string) => y,
      default: () => ''
    }
  }

  const shouldContinue = (state: { message: Array<BaseMessage> }) => {
    const { message } = state
    if (!Array.isArray(message)) return 'end'
    if (!message[0].tool) {
      return 'end'
    }
    return 'continue'
  }

  const callModel = async (state: {
    message: Array<BaseMessage>
    threadId: string
  }) => {
    const { message, threadId } = state
    let outputs
    if (threadId) {
      outputs = await assistantAgent.invoke({
        threadId,
        content: message
      })
    } else {
      outputs = await assistantAgent.invoke({
        content: message
      })
    }
    return {
      message: outputs,
      threadId: outputs.threadId ?? outputs[0].threadId,
      runId: outputs.runId ?? outputs[0].runId,
      toolCallId: Array.isArray(outputs) ? outputs[0].toolCallId : undefined
    }
  }

  const prompt = PromptTemplate.fromTemplate(
    `You are a wellness agent focused on helping the user with good health and life advice. Please use the appropriate Tools to gather a broad range of information before answering the user question in an empathetic tone.`
  )

  const instructions = await prompt.format({})

  const assistantAgent = await OpenAIAssistantRunnable.createAssistant({
    model: 'gpt-4-turbo-preview',
    instructions,
    name: 'Health Assistant',
    asAgent: true,
    tools
  })

  const returnToolResults = async (state: {
    message: Array<ToolCall>
    threadId: string
    runId: string
    toolCallId: string
  }) => {
    const { message, threadId, runId } = state
    const outputs = await assistantAgent.invoke({
      threadId,
      runId,
      toolOutputs: message
    })
    return {
      message: outputs,
      threadId: outputs.threadId ?? outputs[0].threadId,
      runId: outputs.runId ?? outputs[0].runId,
      toolCallId: Array.isArray(outputs) ? outputs[0].toolCallId : undefined
    }
  }

  const callTool = async (state: {
    message: Array<FunctionMessage>
    threadId: string
  }) => {
    const { message, threadId } = state

    const toolCalls = message.map(m => agentToolExecutor.invoke(m))
    const toolResults = await Promise.allSettled(toolCalls)

    const formattedResponses = toolResults.map((result, index) => {
      if (result.status === 'rejected') {
        throw new Error('Tool call failed: ', result.reason)
      }
      return {
        output: result.value,
        tool_call_id: message[index].toolCallId
      }
    })

    return { message: formattedResponses }
  }

  const { threadId, message } = await req.json()

  const workflow = new StateGraph({
    channels: agentState
  })

  workflow.addNode('agent', new RunnableLambda({ func: callModel }))
  workflow.addNode('action', new RunnableLambda({ func: callTool }))
  workflow.addNode(
    'sendResults',
    new RunnableLambda({ func: returnToolResults })
  )
  workflow.setEntryPoint('agent')
  workflow.addConditionalEdges('agent', shouldContinue, {
    continue: 'action',
    end: END
  })

  workflow.addEdge('action', 'sendResults')
  workflow.addConditionalEdges('sendResults', shouldContinue, {
    continue: 'action',
    end: END
  })
  const app = workflow.compile()

  let outputs
  if (threadId) {
    outputs = await app.invoke({
      threadId,
      message
    })
  } else {
    outputs = await app.invoke({
      message
    })
  }

  return AssistantResponse(
    { threadId: outputs.threadId, messageId: '' },
    async ({ sendMessage }) => {
      sendMessage({
        id: '',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: { value: outputs.message.returnValues.output }
          }
        ] as Array<MessageContentText>
      })
    }
  )
}
