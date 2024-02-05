import { StreamingTextResponse, Message } from 'ai'

import { RunnableSequence } from '@langchain/core/runnables'
import { SupabaseVectorStore } from 'langchain/vectorstores/supabase'
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts'
import { BaseMessage } from '@langchain/core/messages'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
import { TaskType } from '@google/generative-ai'

import { BytesOutputParser } from '@langchain/core/output_parsers'
import { createSupabaseClient } from '@/lib/serverUtils'
import { formatMessage } from '@/lib/utils'

import { ChatMessageHistory } from 'langchain/memory'
import { RunnableWithMessageHistory } from '@langchain/core/runnables'
import { formatDocumentsAsString } from 'langchain/util/document'

export const runtime = 'edge'

const embeddings = new GoogleGenerativeAIEmbeddings({
  modelName: 'embedding-001',
  taskType: TaskType.RETRIEVAL_QUERY
})

async function getRetriever(k: number) {
  const client = createSupabaseClient()

  const vectorstore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
    client,
    tableName: 'healthsummary', // name of my table
    queryName: 'match_health_summary_documents' // name of my query function
  })

  const retriever = await vectorstore.asRetriever(k)
  return retriever
}

const model = new ChatGoogleGenerativeAI({
  modelName: 'gemini-pro',
  maxOutputTokens: 2048,
  verbose: true
})

const humanTemplate = `Please provide general health advice.
Here is a conversation from a podcast with a top health professional with a PhD from Stanford University that you might find helpful:
{context}

{question} 
Use the most relevant information from the conversation to answer.`

const chatPrompt = ChatPromptTemplate.fromMessages([
  // ['system', systemTemplate], // not available on gemini
  new MessagesPlaceholder('history'),
  ['human', humanTemplate]
  // ['ai', "Let's respond with empathy."] // not available on gemini
])

async function getHealthContext(question: string) {
  const retriever = await getRetriever(10)
  const documents = await retriever.getRelevantDocuments(question)
  const context = formatDocumentsAsString(documents)
  return context
}

async function getChain(messages: BaseMessage[]) {
  const memory = new ChatMessageHistory(messages)

  const chain = RunnableSequence.from([
    {
      question: ({ question }) => question,
      history: ({ history }) => history,
      context: async ({ question }) => await getHealthContext(question)
    },
    chatPrompt,
    model,
    new BytesOutputParser()
  ])

  const chainWithMemory = new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory: () => memory,
    inputMessagesKey: 'question',
    historyMessagesKey: 'history',
    config: { configurable: { sessionId: 1 } }
  })
  return chainWithMemory
}

export async function POST(req: Request) {
  const { messages } = await req.json()
  const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage)
  const currentMessageContent = messages[messages.length - 1].content
  const chain = await getChain(formattedPreviousMessages)
  const stream = await chain.stream({ question: currentMessageContent })
  // const parser = new BytesOutputParser()
  // const chain = model.pipe(parser)
  // const stream = await chain.stream(currentMessageContent)
  return new StreamingTextResponse(stream)
}
