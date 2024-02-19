import { ChatOpenAI } from '@langchain/openai'
import { TavilySearchResults } from '@langchain/community/tools/tavily_search'
import { ToolExecutor } from '@langchain/langgraph/prebuilt'
import { convertToOpenAIFunction } from '@langchain/core/utils/function_calling'
import {
  FunctionMessage,
  BaseMessage,
  HumanMessage
} from '@langchain/core/messages'
import { AgentAction } from '@langchain/core/agents'
import { StateGraph, END } from '@langchain/langgraph'
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables'
import { BytesOutputParser } from '@langchain/core/output_parsers'
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
// import { OpenAIAssistantRunnable } from 'langchain/experimental/openai_assistant'
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

export async function POST(req: Request) {
  const hydeChain = await getHydeChain(10, 20)

  const hubermanParentDocumentsChain = await getParentDocumentsChain(
    40,
    'huberman'
  )
  // const lexParentDocumentsChain = getParentDocumentsChain(40, 'lex')

  async function retrieveHubermanSummaries(question: string) {
    const summaries = await hydeChain.invoke({ question })
    return summaries
  }

  async function retrieveHubermanTranscripts(question: string) {
    const transcripts = await hubermanParentDocumentsChain.invoke({ question })
    return transcripts
  }

  const summmaryRetrievalTool = new DynamicStructuredTool({
    name: 'retrieve_summaries',
    description: `Retrieves professionally curated summaries from The Huberman Lab podcast which is a show hosted by Dr. Andrew Huberman, a neuroscientist and professor at Stanford University. \
  The podcast focuses on neuroscience and biology, aiming to provide listeners with practical tools derived from scientific research that can improve various aspects of life, \
  such as health, performance, and well-being.`,
    schema: z.object({
      question: z.string()
    }),
    func: async ({ question }) => retrieveHubermanSummaries(question)
  })

  const transcriptRetrievalTool = new DynamicStructuredTool({
    name: 'retrieve_details',
    description: `Retrieves important details from The Huberman Lab podcast which is a show hosted by Dr. Andrew Huberman, a neuroscientist and professor at Stanford University. \
  The podcast focuses on neuroscience and biology, aiming to provide listeners with practical tools derived from scientific research that can improve various aspects of life, \
  such as health, performance, and well-being.`,
    schema: z.object({
      question: z.string()
    }),
    func: async ({ question }) => retrieveHubermanTranscripts(question)
  })

  // async function retrieveLexTranscripts(question: string) {
  //   const transcripts = await lexParentDocumentsChain.invoke({ question })
  //   return transcripts
  // }

  const tools = [
    new TavilySearchResults({
      maxResults: 5
      // kwargs: {
      //   raw
      // }
    }),
    transcriptRetrievalTool,
    summmaryRetrievalTool
  ]

  const toolExecutor = new ToolExecutor({
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
    }
  }

  // Define the function that determines whether to continue or not
  const shouldContinue = (state: { message: Array<BaseMessage> }) => {
    const { message } = state
    if (!Array.isArray(message)) return 'end'
    if (!message[0].tool) {
      return 'end'
    }
    return 'continue'
  }

  // Define the function that calls the model
  const callModel = async (state: {
    message: Array<BaseMessage>
    threadId: string
  }) => {
    const { message, threadId } = state
    console.log('THREAD ID: ', threadId)
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
    console.log('outputs: ', outputs)
    // We return a list, because this will get added to the existing list
    return {
      message: outputs,
      threadId: outputs.threadId ?? outputs[0].threadId,
      // messageId: outputs.id,
      runId: outputs.runId ?? outputs[0].runId,
      toolCallId: Array.isArray(outputs) ? outputs[0].toolCallId : undefined
    }
  }

  const returnToolResults = async (state: {
    message: Array<ToolCall>
    threadId: string
    runId: string
    toolCallId: string
  }) => {
    const { message, threadId, runId } = state
    console.log('thread and run id: ', threadId, runId)
    const outputs = await assistantAgent.invoke({
      threadId,
      runId,
      toolOutputs: message
    })
    console.log('resulting generation: ', outputs)
    // We return a list, because this will get added to the existing list
    return {
      message: outputs,
      threadId: outputs.threadId ?? outputs[0].threadId,
      // messageId: outputs.id,
      runId: outputs.runId ?? outputs[0].runId,
      toolCallId: Array.isArray(outputs) ? outputs[0].toolCallId : undefined
    }
  }

  const callTool = async (state: {
    message: Array<FunctionMessage>
    threadId: string
  }) => {
    const { message, threadId } = state

    const toolCalls = message.map(m => toolExecutor.invoke(m))
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

  const prompt = PromptTemplate.fromTemplate(
    `Please provide general health advice to answer the user's question. \
Let's think through our response as it's very important for the user. \
Use a combination of Tools to retrieve the gather the most possible information. \
Use the most relevant information from the podcast to answer.`
  )

  const instructions = await prompt.format({})

  const assistantAgent = await OpenAIAssistantRunnable.createAssistant({
    model: 'gpt-4-turbo-preview',
    instructions,
    name: 'Health Assistant',
    asAgent: true,
    tools
  })

  const { message, threadId } = await req.json()

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

  console.log('final outputs: ', outputs)

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
