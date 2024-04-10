import { StreamingTextResponse } from 'ai'

// import { RemoteRunnable } from "langchain/runnables/remote"
import {
  BytesOutputParser,
  StringOutputParser
} from 'langchain/schema/output_parser'
import { pull, push } from 'langchain/hub'
import { AIMessage, HumanMessage, SystemMessage } from 'langchain/schema'
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  AIMessagePromptTemplate,
  MessagesPlaceholder,
  PipelinePromptTemplate,
  PromptTemplate
} from 'langchain/prompts'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { createSupabaseClient } from '@/lib/serverUtils'
import {
  RunnableSequence,
  RunnableBranch,
  RunnableMap,
  RunnableLambda
} from 'langchain/schema/runnable'
import { NextResponse } from 'next/server'
import { LangChainTracer } from 'langchain/callbacks'
import { BedrockChat } from 'langchain/chat_models/bedrock'
import { BedrockAnthropicChat } from '@/lib/models'
import { FewShotPromptTemplate } from 'langchain/prompts'
import { Client } from 'langsmith'
import { getExamples, getDataset } from '@/app/langsmith-actions'

const client = new Client()
// export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()

  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const jokeFewShotTemplate = `<example>
H: tell me a joke.
A: <joke>{joke}</joke>
</example>`

  const flopFewShotTemplate = `<example>
H: tell me a joke.
A: <flop>{flop}</flop>
</example>`

  // const examples = [
  //   {joke: "Why did the chicken cross the road? To get to the other side!"},
  //   {joke: "Why did the chicken cross the playground? To get to the other slide!"},
  //   {joke: "Knock knock. Who's there? Lettuce. Lettuce who? Lettuce in, it's cold out here!"},
  // ]

  const jokesDataset = await getDataset('jokes')
  const jokesExamples = await getExamples(jokesDataset?.id)

  const formattedJokes = jokesExamples.map(j => ({ joke: j }))

  const jokeFewShotPromptTemplate =
    PromptTemplate.fromTemplate(jokeFewShotTemplate)
  const flopFewShotPromptTemplate =
    PromptTemplate.fromTemplate(flopFewShotTemplate)

  const fewShotPromptJokes = new FewShotPromptTemplate({
    examplePrompt: jokeFewShotPromptTemplate,
    examples: formattedJokes,
    inputVariables: [],
    prefix: `\nHere are examples of good jokes:\n`,
    suffix: `\n`
  })

  const flopsDataset = await getDataset('flops')
  const flopsExamples = await getExamples(flopsDataset?.id)

  const formattedFlops = flopsExamples.map(j => ({ flop: j }))

  const fewShotPromptFlops = new FewShotPromptTemplate({
    examplePrompt: flopFewShotPromptTemplate,
    examples: formattedFlops,
    inputVariables: [],
    prefix: `\nHere are examples of bad jokes or flops:\n`,
    suffix: `\n`
  })

  const finalTemplate = `{system}{jokes}{flops}{message}{instruction}`

  const finalPromptTemplate = PromptTemplate.fromTemplate(finalTemplate)

  const jokePromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: 'system',
        prompt: PromptTemplate.fromTemplate(
          'You are a joke telling AI. You are paid to good jokes and make people laugh.'
        )
      },
      {
        name: 'jokes',
        // @ts-ignore
        prompt: fewShotPromptJokes
      },
      {
        name: 'flops',
        // @ts-ignore
        prompt: fewShotPromptFlops
      },
      {
        name: 'message',
        prompt: PromptTemplate.fromTemplate(`
Current conversation message:
<message>
{currentMessage}
</message>
`)
      },
      {
        name: 'flops',
        prompt:
          PromptTemplate.fromTemplate(`When you reply, use the examples of good jokes and flops to understand the user's sense of humor. Remember that flops are bad jokes. \
        List jokes that you find relevant word for word inside <thinking></thinking> XML tags. \
        This is a space for you to write down relevant content and will not be shown to the user. \
        Once you are done extracting insights to the user's sense of humor, respond to the message with a joke.`)
      }
    ],
    finalPrompt: finalPromptTemplate
  })

  const model = new BedrockChat({
    model: 'anthropic.claude-v2:1',
    region: 'us-east-1',
    maxTokens: 1000,
    temperature: 0.9,
    credentials: {
      accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!
    }
  })

  const parser = new BytesOutputParser()

  const jokeChain = jokePromptTemplate.pipe(model).pipe(parser)

  const { messages } = await req.json()
  const currentMessage = messages[messages.length - 1].content
  // https://www.anthropic.com/news/claude-2-1-prompting TODO

  const stream = await jokeChain.stream({ currentMessage })

  return new StreamingTextResponse(stream)
}
