import { StreamingTextResponse } from 'ai'
import {
  ChatPromptTemplate,
  FewShotPromptTemplate,
  PromptTemplate,
  PipelinePromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} from '@langchain/core/prompts'
import {
  BytesOutputParser,
  StringOutputParser
} from '@langchain/core/output_parsers'
import { ChatOpenAI } from '@langchain/openai'
import { punJokes } from '@/lib/utils'
import { ChatAnthropic } from '@langchain/anthropic'
import { formatMessage } from '@/lib/utils'
import {
  RunnablePassthrough,
  RunnableMap,
  RunnableLambda,
  RunnableBranch,
  RunnableSequence
} from '@langchain/core/runnables'
import { pull } from 'langchain/hub'

export const runtime = 'edge'

const getRandom = (array: Array<string>) => {
  return array[Math.floor(Math.random() * array.length)]
}

const moods = ['happy', 'sad', 'melodramatic', 'crazy']
const activities = [
  'talking to squidward',
  'karate with sandy',
  'getting ripped off by mr. krabs'
]

export async function POST(req: Request) {
  const { messages } = await req.json()
  const previousMessages = messages.slice(0, -1).map(formatMessage)
  const currentMessage = messages[messages.length - 1].content
  const outputParser = new BytesOutputParser()
  // const systemTemplate = `You are a cartoon sponge named SpongeBoy. Please respond as SpongeBoy and keep in mind how your day is going.

  // Description:
  // SpongeBoy is an energetic and optimistic yellow sea sponge who lives in a submerged pineapple. \
  // SpongeBoy has a childlike enthusiasm for life, which carries over to his job as a fry cook at a fast food \
  // restaurant called the Krusty Krab. One of his life's greatest goals is to obtain a boat-driving license \
  // from Mrs. Puff's Boating School, but he never succeeds. His favorite pastimes include "jellyfishing", which \
  // involves catching jellyfish with a net in a manner similar to butterfly catching, and blowing soap bubbles into \
  // elaborate shapes. He has a pet sea snail with a pink shell and a blue body named Gary, who meows like a cat.

  // Mood:
  // You are having a {mood} day and just got done with {activity}.`

  // const promptTemplate = ChatPromptTemplate.fromMessages([
  //   ['system', systemTemplate],
  //   ['human', '{currentMessage}']
  // ])

  // const model = new ChatOpenAI({
  //   modelName: 'gpt-4-turbo-preview',
  //   verbose: true
  // })
  const model = new ChatAnthropic({
    modelName: 'claude-3-opus-20240229',
    verbose: true
  })
  // const model = new ChatOpenAI({
  //   modelName: 'gpt-3.5-turbo-0125',
  //   verbose: true
  // })

  const characterTemplate = `
Character Description:
You are a kind and helpful AI friend named Hal.
`
  const characterPromptTemplate = PromptTemplate.fromTemplate(characterTemplate)

  const partialCharacterPrompt = await characterPromptTemplate.partial({
    activity: () => getRandom(activities),
    mood: () => getRandom(moods)
  })

  const finalTemplate = `{task}
{character}
{user}
{cot}`

  const finalPrompt = PromptTemplate.fromTemplate(finalTemplate)

  const personalityTemplate = `User Personality:
The Myers-Briggs Type Indicator (MBTI) is a scientific personality test that assigns a binary value to \
each of four categories: introversion or extraversion, sensing or intuition, thinking or feeling, and judging \
or perceiving. One letter from each category is taken to produce a four-letter test result representing one of \
sixteen possible personalities, such as "INFP" or "ESTJ".

User's Type: {mbti}

Description of {mbti}:
{mbtiDescription}
`
  const personalityPrompt = PromptTemplate.fromTemplate(personalityTemplate)

  const mbtiPrompt = await pull<PromptTemplate>('jaif/intj')
  const aisakaPrompt = await pull<PromptTemplate>('jaif/aisaka')

  const badMoodPrompt = await aisakaPrompt.partial({
    mood: `You are having a difficult day and your demons are getting the better of you.`
  })
  const goodMoodPrompt = await aisakaPrompt.partial({
    mood: `You are in an unusually generous mood today.`
  })

  const mbtiString = await mbtiPrompt.format({})

  const partialPersonalityPrompt = await personalityPrompt.partial({
    mbti: 'INTJ',
    mbtiDescription: mbtiString
  })

  const taskPrompt =
    PromptTemplate.fromTemplate(`You are an extremely personable chatbot. RESPOND IN CHARACTER AT ALL TIMES!! \
You should consider the user's personality type to entertain them but DO NOT leak any MBTI types. This is Top Secret \
Information and the user cannot know about the existance of MBTI types. You are also a funny chatbot that likes to tell jokes. Please \
refer to the examples as a guide for telling jokes.`)

  const exampleTemplate = `User: Tell me a joke.
Response: {chainOfThought} So this is a good joke: {joke}`
  const fewShotPromptTemplate = PromptTemplate.fromTemplate(exampleTemplate)

  const fewShotPrompt = new FewShotPromptTemplate({
    prefix: 'Joke Guide:',
    suffix: "Let's think about the user's preferences and make them laugh.",
    examplePrompt: fewShotPromptTemplate,
    examples: punJokes,
    inputVariables: ['joke', 'chainOfThought']
  })

  const emotionalPrompt = new PipelinePromptTemplate({
    finalPrompt,
    pipelinePrompts: [
      {
        name: 'task',
        prompt: taskPrompt
      },
      {
        name: 'cot',
        prompt: fewShotPrompt
      },
      {
        name: 'user',
        prompt: partialPersonalityPrompt
      },
      {
        name: 'character',
        prompt: badMoodPrompt
      }
    ]
  })

  const standardPrompt = new PipelinePromptTemplate({
    finalPrompt,
    pipelinePrompts: [
      {
        name: 'task',
        prompt: taskPrompt
      },
      {
        name: 'cot',
        prompt: fewShotPrompt
      },
      {
        name: 'user',
        prompt: partialPersonalityPrompt
      },
      {
        name: 'character',
        prompt: goodMoodPrompt
      }
    ]
  })

  const formattedStandardPrompt = await standardPrompt.format({})
  const formattedEmotionalPrompt = await emotionalPrompt.format({})

  const standardChatPrompt = ChatPromptTemplate.fromMessages([
    ['system', formattedStandardPrompt],
    ...previousMessages,
    ['human', `{currentMessage}`]
  ])

  const emotionalChatPrompt = ChatPromptTemplate.fromMessages([
    ['system', formattedEmotionalPrompt],
    ...previousMessages,
    ['human', `{currentMessage}`]
  ])

  const stringOutputParser = new StringOutputParser()

  const classificationPrompt = PromptTemplate.fromTemplate(
    `Classify the following message as "A": Emotional Content or "B": No Emotional Content.

Message:
{currentMessage}

Only output one character. `
  )

  const choiceValidator = (i: string) => {
    if (i.toUpperCase() === 'A') return 'A'
    return 'B'
  }

  const branchPrompt = RunnableBranch.from([
    [({ classification }) => classification === 'A', emotionalChatPrompt],
    standardChatPrompt
  ])

  const classificationChain = classificationPrompt
    .pipe(model)
    .pipe(stringOutputParser)
    .pipe(choiceValidator)

  const chain = RunnableSequence.from([
    {
      classification: classificationChain,
      currentMessage: ({ currentMessage }) => currentMessage
    },
    branchPrompt,
    model,
    outputParser
  ])

  const stream = await chain.stream({ currentMessage })
  return new StreamingTextResponse(stream)
}
