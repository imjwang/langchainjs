import { StreamingTextResponse, Message } from 'ai'

import {
  RunnablePassthrough,
  RunnableSequence
} from '@langchain/core/runnables'
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
import { PromptTemplate } from '@langchain/core/prompts'
import { HydeRetriever } from 'langchain/retrievers/hyde'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { VoyageEmbeddings } from 'langchain/embeddings/voyage'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document'
import { SupabaseDocstore } from '@/lib/utils'
import type { BaseStore } from '@langchain/core/stores'

export const runtime = 'edge'

const hydeModel = new ChatOpenAI({
  modelName: 'gpt-3.5-turbo-0125',
  verbose: true
})

const model = new ChatGoogleGenerativeAI({
  modelName: 'gemini-pro',
  maxOutputTokens: 2048,
  verbose: true
})

const summaryEmbeddings = new GoogleGenerativeAIEmbeddings({
  modelName: 'embedding-001',
  taskType: TaskType.RETRIEVAL_QUERY
})

// const embeddings = new VoyageEmbeddings({
//   modelName: 'voyage-02'
// })

const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
  dimensions: 1024
})

const summaryPrompt = PromptTemplate.fromTemplate(`Question:
{question}
Please write a concise summary of a podcast between health professionals that addresses the question. \
The summary should include the most important takeaways and actionable advice.
`)

async function getHydeRetriever() {
  const client = createSupabaseClient()
  const summaryVectorstore = await SupabaseVectorStore.fromExistingIndex(
    summaryEmbeddings,
    {
      client,
      tableName: 'healthsummary', // name of my table
      queryName: 'match_summary_documents' // name of my query function
    }
  )
  return summaryVectorstore.asRetriever({
    k: 10,
    searchKwargs: {
      fetchK: 20,
      lambda: 0.5
    },
    filter: {
      source: 'huberman'
    }
  })
}

const hydeChain = RunnableSequence.from([
  summaryPrompt,
  hydeModel,
  new StringOutputParser(),
  async () => await getHydeRetriever(),
  formatDocumentsAsString
])

async function getParentChildRetriever(k: number) {
  const client = createSupabaseClient()
  const vectorstore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
    client,
    tableName: 'podcasts', // name of my table
    queryName: 'match_podcasts_documents' // name of my query function
  })
  //@ts-ignore
  const docstore = new SupabaseDocstore(client, 'parent_documents') as BaseStore
  //@ts-ignore
  const retriever = new ParentDocumentRetriever({
    childDocumentRetriever: vectorstore.asRetriever({
      k: k * 2,
      filter: {
        source: 'huberman'
      }
    }),
    idKey: 'parent_id',
    docstore,
    parentK: k // because the chunks
  })
  return retriever
}

const parentDocumentsChain = RunnableSequence.from([
  ({ question }) => question,
  async () => await getParentChildRetriever(10),
  formatDocumentsAsString
])

const compressionPrompt = PromptTemplate.fromTemplate(`\
Please help me answer the user question, it is very important. Included are data from a podcast hosted by a top health professional with a PhD from Stanford University:

The following are important key points from the podcast:
{summaries}

The following are excerpts from the podcast:
{parentDocuments}

Question:
{question}

Let's use the summaries to think about what is important. Extract the most important information from the excepts with regards to the user question so I can advise them further.
`)

const compressionChain = RunnableSequence.from([
  compressionPrompt,
  model,
  new StringOutputParser()
])

const humanTemplate = `Please provide general health advice to answer the user's question.
Use the following information for reference. It has been curated for you from a podcast with a top health professional who has a PhD from Stanford University:

Summaries:
{summaries}

Important notes:
{extractions}

Question:
{question}

Let's think through our response as it's very important for the user. Use the most relevant information from the podcast to answer.`

const chatPrompt = ChatPromptTemplate.fromMessages([
  // ['system', systemTemplate], // not available on gemini
  new MessagesPlaceholder('history'),
  ['human', humanTemplate]
  // ['ai', "Let's respond with empathy."] // not available on gemini
])

// async function getHealthContext(question: string) {
//   const retriever = await getRetriever(10)
//   const documents = await retriever.getRelevantDocuments(question)
//   const context = formatDocumentsAsString(documents)
//   return {
//     context,
//     summaryContext
//   }
// }

async function getChain(messages: BaseMessage[]) {
  const memory = new ChatMessageHistory(messages)

  const chain = RunnableSequence.from([
    {
      summaries: hydeChain,
      parentDocuments: parentDocumentsChain,
      question: ({ question }) => question,
      history: ({ history }) => history
    },
    {
      extractions: compressionChain,
      summaries: ({ summaries }) => summaries,
      question: ({ question }) => question,
      history: ({ history }) => history
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
