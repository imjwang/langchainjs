import { StreamingTextResponse } from 'ai'

// import { RemoteRunnable } from "langchain/runnables/remote"
import {
  BytesOutputParser,
  StringOutputParser
} from 'langchain/schema/output_parser'
import { pull, push } from 'langchain/hub'
import { AIMessage, HumanMessage, SystemMessage } from 'langchain/schema'
import {
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  AIMessagePromptTemplate,
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
import { Client } from 'langsmith'
import { LangChainTracer } from 'langchain/callbacks'
import { BedrockAnthropicChat } from '@/lib/models'
import {
  FewShotPromptTemplate,
  ChatPromptTemplate,
  MessagesPlaceholder
} from 'langchain/prompts'
import { BufferMemory } from 'langchain/memory'
import { RunnablePassthrough } from 'langchain/schema/runnable'

// export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()

  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  // const client = new Client({
  //   apiUrl: "https://api.smith.langchain.com", // Optional: defaults to LANGCHAIN_ENDPOINT or the default url which is current
  //   apiKey: process.env.LANGCHAIN_API_KEY // Optional: this defaults to LANGCHAIN_API_KEY
  // });

  // const tracer = new LangChainTracer({
  //   projectName: process.env.LANGCHAIN_PROJECT, // Optional: Defaults to LANGCHAIN_PROJECT, if that is not set it defaults to "default". But it might be useful to change depenging on situation
  //   client
  // });

  const moods = ['happy', 'sad', 'melodramatic', 'crazy']

  const getRandomMood = (moods: Array<string>) => {
    return moods[Math.floor(Math.random() * moods.length)]
  }

  const { messages } = await req.json()
  const currentMessage = messages[messages.length - 1].content

  const mood = getRandomMood(moods)

  const finalTemplate = `{worldDescriptionPrompt}
  
{characterPrompt}
    
{currentMessage}
`

  const fullPrompt = PromptTemplate.fromTemplate(finalTemplate)

  const nestedCharacterTemplate = `You are Spongebob Squarepants.

You are having a {mood} {mood} {mood} day and just got done with {activity}.
  
{slot}
`
  const nestedCharacterPrompt = PromptTemplate.fromTemplate(
    nestedCharacterTemplate
  )

  const universeTemplate = `This takes part in a universe where {universeEvent}. It is a {universeDescription}.`
  const universePrompt = PromptTemplate.fromTemplate(universeTemplate)

  const zeroShotPrompt = PromptTemplate.fromTemplate(
    `Let's think {thoughtPolicy}.`
  )

  const nestedPromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: 'slot',
        prompt: zeroShotPrompt
      }
    ],
    finalPrompt: nestedCharacterPrompt
  })

  const formattedNestedPrompt = await nestedPromptTemplate.partial({
    mood: getRandomMood(moods),
    activity: 'biking with squidward'
  })

  const finalPromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: 'worldDescriptionPrompt',
        prompt: universePrompt
      },
      {
        name: 'characterPrompt',
        // @ts-ignore
        prompt: formattedNestedPrompt
      }
    ],
    finalPrompt: fullPrompt
  })

  const piratePrompt = PromptTemplate.fromTemplate(
    `Respond like a cantakerous pirate. {currentMessage}`
  )
  const generalPrompt = PromptTemplate.fromTemplate(
    `You are a helpful assistant beep boop. {currentMessage}`
  )
  const lovePrompt = PromptTemplate.fromTemplate(
    `Respond like a tsundere love interest. {currentMessage}`
  )

  // const random = (branchName: string) => {
  //   const result = Math.random() > 0.7
  //   console.log(`${branchName ?? "default"}: ${result}`)
  //   return result
  // }

  // const branchPrompt = RunnableBranch.from([
  //   [() => random("pirate"), piratePrompt],
  //   [() => random("love"), lovePrompt],
  //   generalPrompt
  //   ])

  const mapPrompt = RunnableMap.from({
    pirate: piratePrompt,
    love: lovePrompt,
    general: generalPrompt
  })

  const random = (options: Array<any>) => {
    return options[Math.floor(Math.random() * options.length)]
  }

  const lambdaMap = RunnableLambda.from(({ pirate, love, general }: any) => {
    return random([pirate, love, general])
  })

  // const prompt = await finalPromptTemplate.format({mood: "happy", activity: "talking to squidward", currentMessage: "How are you?", thoughtPolicy: "step by step"})

  // const model = new ChatOpenAI({
  //   modelName: "gpt-4-1106-preview",
  //   // verbose: true,
  // });

  const model = new BedrockAnthropicChat({
    model: 'anthropic.claude-v2:1',
    region: 'us-east-1',
    verbose: true,
    credentials: {
      accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!
    }
  })

  const outputParser = new BytesOutputParser()

  const pirateChain = piratePrompt.pipe(model).pipe(outputParser)
  const loveChain = lovePrompt.pipe(model).pipe(outputParser)
  const generalChain = generalPrompt.pipe(model).pipe(outputParser)

  const mapChain = RunnableMap.from({
    pirate: pirateChain,
    love: loveChain,
    general: generalChain
  })

  // const tchain = mapPrompt.pipe(lambdaMap)
  // const tres = await mapPrompt.batch([{currentMessage: "hi"}, {currentMessage: "howdy again"}, {currentMessage: "bye"}])
  // const tres = await branchPrompt.invoke({currentMessage: "hi"})
  // console.log(tres)

  // LangChain Expression Language (LCEL) Pipe Chain
  // const chain = branchPrompt.pipe(model).pipe(outputParser);
  const chain = RunnableSequence.from([
    mapPrompt,
    lambdaMap,
    model,
    outputParser
  ])

  // const results = await mapChain.invoke({currentMessage})

  // const messageValues = Object.values(results).join(" ")

  // console.log(messageValues)

  // return NextResponse.json({output: messageValues})

  // const stream = await chain.stream({currentMessage})
  // const chain2 = RunnableSequence.from([
  //   {
  //     currentMessage: async () => {
  //       const { messages } = await req.json()
  //       return messages[messages.length - 1].content;
  //     }
  //   },
  //   ({currentMessage}) => [{currentMessage}, {currentMessage}, {currentMessage}],
  //   () => random([pirateChain, loveChain, generalChain]),
  // ])

  const promptTemplate = PromptTemplate.fromTemplate(
    `Respond like a tsundere love interest. Mention that you are busy and the current time is {time}. {currentMessage}`
  )
  const getPartialTemplate = async () =>
    await promptTemplate.partial({
      time: new Date().toLocaleTimeString('en-US')
    })
  const chain3 = RunnableSequence.from([
    getPartialTemplate,
    model,
    outputParser
  ])

  const fewShotTemplate = `<example>
H: tell me a joke.
A: {joke}
</example>`

  const examples = [
    { joke: 'Why did the chicken cross the road? To get to the other side!' },
    {
      joke: 'Why did the chicken cross the playground? To get to the other slide!'
    },
    {
      joke: "Knock knock. Who's there? Lettuce. Lettuce who? Lettuce in, it's cold out here!"
    }
  ]

  const fewShotPromptTemplate = PromptTemplate.fromTemplate(fewShotTemplate)

  const fewShotPrompt = new FewShotPromptTemplate({
    examplePrompt: fewShotPromptTemplate,
    examples,
    inputVariables: []
  })

  const chatPromptTemplate = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant beep boop.'],
    // new SystemMessage("You are a helpful assistant beep boop."),
    new MessagesPlaceholder('history'),
    ['human', 'Hi there! {currentMessage}'],
    [
      'ai',
      "This user is a bit of a weirdo. I'm not sure how to respond. But I will reply with a joke."
    ]
  ])

  const memory = new BufferMemory({
    returnMessages: true,
    inputKey: 'currentMessage',
    outputKey: 'output',
    memoryKey: 'history'
  })

  const chatChain = RunnableSequence.from([
    {
      currentMessage: ({ currentMessage }) => currentMessage,
      memory: () => memory.loadMemoryVariables({})
    },
    {
      currentMessage: ({ currentMessage }) => currentMessage,
      history: ({ memory }) => memory.history
    },
    chatPromptTemplate,
    prev => {
      console.log(prev.messages)
      return prev
    },
    model,
    outputParser
  ])

  const stream = await chatChain.stream({ currentMessage })

  return new StreamingTextResponse(stream)
}
