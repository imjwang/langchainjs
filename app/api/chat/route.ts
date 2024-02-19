import { StreamingTextResponse, Message } from 'ai'

import { RemoteRunnable } from '@langchain/core/runnables/remote'
import { BytesOutputParser } from 'langchain/schema/output_parser'
import { pull } from 'langchain/hub'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
  SystemMessagePromptTemplate,
  AIMessagePromptTemplate,
  HumanMessagePromptTemplate
} from '@langchain/core/prompts'
import { createSupabaseClient } from '@/lib/serverUtils'
import { AIMessage, HumanMessage, SystemMessage } from 'langchain/schema'
import { formatMessage } from '@/lib/utils'
import { ChatMessageHistory } from 'langchain/memory'
import { RunnableWithMessageHistory } from '@langchain/core/runnables'
import { push } from 'langchain/hub'

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()

  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const { messages, pushToHub } = await req.json()

  const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage)
  const currentMessageContent = messages[messages.length - 1].content

  const memory = new ChatMessageHistory(formattedPreviousMessages)

  const pirateChatPrompt = await pull<ChatPromptTemplate>('jaif/piratechat')

  const model = new ChatOpenAI({})
  // const model = new RemoteRunnable({
  //   url: 'https://0fb2-34-125-33-51.ngrok-free.app/openai/stream'
  // })
  const outputParser = new BytesOutputParser()

  const chain = pirateChatPrompt.pipe(model).pipe(outputParser)

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory: () => memory,
    inputMessagesKey: 'input',
    historyMessagesKey: 'history',
    config: { configurable: { sessionId: 1 } }
  })

  const stream = await model.stream({
    input: currentMessageContent
  })

  if (pushToHub) {
    try {
      await push('jaif/piratechat', pirateChatPrompt)
    } catch (e) {
      console.log(e)
    }
  }

  return new StreamingTextResponse(stream)
}
