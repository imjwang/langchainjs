import { StreamingTextResponse, Message } from 'ai'

import { RemoteRunnable } from 'langchain/runnables/remote'
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
import { push as pushToHub } from 'langchain/hub'

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()

  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const { messages, push } = await req.json()

  const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage)
  const currentMessageContent = messages[messages.length - 1].content

  const memory = new ChatMessageHistory(formattedPreviousMessages)

  const piratePrompt = await pull<PromptTemplate>('jaif/pirate')

  const chatPromptTemplate = ChatPromptTemplate.fromMessages([
    new SystemMessagePromptTemplate({ prompt: piratePrompt }),
    new MessagesPlaceholder('history'),
    HumanMessagePromptTemplate.fromTemplate('{input}'),
    AIMessagePromptTemplate.fromTemplate(
      'Arr matey! Let me sing you a shanty bout manatees first before we continue. '
    )
  ])

  const model = new ChatOpenAI({})
  const outputParser = new BytesOutputParser()

  const chain = chatPromptTemplate.pipe(model).pipe(outputParser)

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory: () => memory,
    inputMessagesKey: 'input',
    historyMessagesKey: 'history',
    config: { configurable: { sessionId: 1 } }
  })

  const stream = await chainWithHistory.stream({
    input: currentMessageContent
  })

  if (push) {
    try {
      await pushToHub('jaif/piratechat', chatPromptTemplate)
    } catch (e) {
      console.log(e)
    }
  }

  return new StreamingTextResponse(stream)
}
