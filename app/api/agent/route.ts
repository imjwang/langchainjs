//next
import { NextResponse } from 'next/server'
// ai sdk
import { StreamingTextResponse, Message } from 'ai'
// chat
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { BytesOutputParser } from 'langchain/schema/output_parser'
// prompt
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts'
import { createSupabaseClient } from '@/lib/serverUtils'
import { SupabaseVectorStore } from 'langchain/vectorstores/supabase'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai' // Replace this with your embedding model
import { HydeRetriever } from 'langchain/retrievers/hyde'
// chain
import { RunnableSequence } from 'langchain/schema/runnable'
import { formatDocumentsAsString } from 'langchain/util/document'
// agent
import { DynamicTool } from 'langchain/tools'
import { AgentExecutor } from 'langchain/agents'
import { Calculator } from 'langchain/tools/calculator'
import {
  AgentAction,
  AgentFinish,
  AgentStep,
  BaseMessage,
  AIMessage,
  HumanMessage,
  SystemMessage,
  InputValues
} from 'langchain/schema'
import { formatLogToString } from 'langchain/agents/format_scratchpad/log'
import { XMLAgentOutputParser } from 'langchain/agents/xml/output_parser'
import { renderTextDescription } from 'langchain/tools/render'
import { formatLogToMessage } from 'langchain/agents/format_scratchpad/log_to_message'
import type { Tool } from 'langchain/tools'

export const runtime = 'edge'

const formatMessage = (message: Message) => {
  if (message.role === 'system') {
    return new SystemMessage(message.content)
  } else if (message.role === 'user') {
    return new HumanMessage(message.content)
  } else {
    return new AIMessage(message.content)
  }
}

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()

  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const { messages, index } = await req.json()
  const collectionDescription =
    'This is a collection of transcripts from a health and fitness podcast'

  const model = new ChatOpenAI({ verbose: true }).bind({
    stop: ['</tool_input>', '</final_answer>']
  })

  const vectorStore = await SupabaseVectorStore.fromExistingIndex(
    new OpenAIEmbeddings(),
    {
      client: supabase,
      tableName: index,
      queryName: 'match_documents',
      filter: {
        index
      }
    }
  )

  const retriever = vectorStore.asRetriever(4)

  async function getRelevantDocuments(query: string) {
    const relevantDocs = await retriever.getRelevantDocuments(query)
    const serialized = formatDocumentsAsString(relevantDocs)
    return serialized
  }

  const retrieverTool = new DynamicTool({
    name: 'Query Vectorstore',
    description: `call this to get relevent information from a vectorstore with the following description:\n${collectionDescription}\nThe input should be a string`,
    func: getRelevantDocuments
  })

  const AGENT_INSTRUCTIONS = `You are a helpful assistant. Help the user answer any questions.

  You have access to the following tools:
  
  {tools}
  
  In order to use a tool, you can use <tool></tool> and <tool_input></tool_input> tags.
  You will then get back a response in the form <observation></observation>
  For example, if you have a tool called 'search' that could run a google search, in order to search for the weather in SF you would respond:
  
  <tool>search</tool><tool_input>weather in SF</tool_input>
  <observation>64 degrees</observation>
  
  When you are done, respond with a final answer between <final_answer></final_answer>. For example:
  
  <final_answer>The weather in SF is 64 degrees</final_answer>
  
  Begin!
  
  Question: {input}`

  const systemTemplate = `You are a helpful friend and medical professional.`

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemTemplate],
    new MessagesPlaceholder('chatHistory'),
    new MessagesPlaceholder('agent_scratchpad'),
    ['human', AGENT_INSTRUCTIONS]
  ])

  const tools = [new Calculator(), retrieverTool]

  const chain = RunnableSequence.from([
    {
      input: (i: {
        input: string
        tools: Tool[]
        steps: AgentStep[]
        previousMessages: Message[]
      }) => i.input,
      agent_scratchpad: (i: {
        input: string
        tools: Tool[]
        steps: AgentStep[]
        previousMessages: Message[]
      }) => formatLogToMessage(i.steps),
      tools: (i: {
        input: string
        tools: Tool[]
        steps: AgentStep[]
        previousMessages: Message[]
      }) => renderTextDescription(i.tools),
      chatHistory: (i: {
        input: string
        tools: Tool[]
        steps: AgentStep[]
        previousMessages: Message[]
      }) => i.previousMessages?.map(formatMessage)
    },
    prompt,
    model,
    new XMLAgentOutputParser()
  ])

  const executor = new AgentExecutor({
    agent: chain,
    tools
  })

  const previousMessages = messages.slice(0, -1)
  const currentMessageContent = messages[messages.length - 1].content

  const output = await executor.invoke({
    input: currentMessageContent,
    previousMessages,
    tools
  })
  console.log(output)
  // return new StreamingTextResponse(stream)
  return NextResponse.json({ output })
}
