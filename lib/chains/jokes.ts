'use server'

import {
  StringOutputParser,
  XMLOutputParser
} from '@langchain/core/output_parsers'
import { ChatAnthropic } from '@langchain/anthropic'
import { RunnableSequence } from '@langchain/core/runnables'
import {
  PromptTemplate,
  FewShotPromptTemplate,
  PipelinePromptTemplate
} from '@langchain/core/prompts'
import { XMLParser } from 'fast-xml-parser'
import { punJokes } from '@/lib/utils'

const model = new ChatAnthropic({
  modelName: 'claude-3-opus-20240229',
  temperature: 1, // 1 is the max
  verbose: true
})

const topicGenerationTemplate = `Generate {n} topics for jokes. For example: animal, food, programming. Please output in XML. Example: \
<topics>
  <name>
    programming
  </name>
  <name>
    food
  </name>
  <name>
    animals
  </name>
</topics>
Generate {n} new topics for fun jokes! Output only XML.
`
const topicGenerationPrompt = PromptTemplate.fromTemplate(
  topicGenerationTemplate
)
const topicGenerationChain = RunnableSequence.from([
  topicGenerationPrompt,
  model,
  new XMLOutputParser()
])

const exampleTemplate = `\
  <joke>
    {joke}
  </joke>
  <reason>
    {chainOfThought}
  </reason>`
const fewShotPromptTemplate = PromptTemplate.fromTemplate(exampleTemplate)
const fewShotPrompt = new FewShotPromptTemplate({
  prefix: `<example>`,
  suffix: `</example>`,
  examplePrompt: fewShotPromptTemplate,
  examples: punJokes,
  inputVariables: ['joke', 'chainOfThought']
})
const finalPrompt = PromptTemplate.fromTemplate(`{task}{example}{instructions}`)
const jokeGenerationPrompt = new PipelinePromptTemplate({
  finalPrompt,
  pipelinePrompts: [
    {
      name: 'task',
      prompt: PromptTemplate.fromTemplate(
        `Produce 5 exemplary jokes about {name}. Also include reasoning for why they are funny. Here is an example of previous jokes that the user enjoyed:`
      )
    },
    {
      name: 'example',
      prompt: fewShotPrompt
    },
    {
      name: 'instructions',
      prompt: PromptTemplate.fromTemplate(
        `Generate new {name} jokes that fit with the user's sense of humor. Respond in XML with <response></response> tags.`
      )
    }
  ]
})
const parser = new XMLParser()
const jokeGenerationChain = RunnableSequence.from([
  jokeGenerationPrompt,
  model,
  new StringOutputParser(),
  text => parser.parse(text)
])

export async function generateJokes(n: string) {
  const { topics } = await topicGenerationChain.invoke({ n }) // lower if running into API limits
  const inputs = topics.map(({ name }) => {
    return {
      name: name.trim() // there could be white space so we trim
    }
  })
  const jokes = await jokeGenerationChain.batch(inputs)
  return jokes
}
