import { PromptTemplate, PipelinePromptTemplate } from 'langchain/prompts'

export const runtime = 'edge'

export async function GET(req: Request) {
  const template = `You are Spongebob Squarepants.

'You are having a {mood} day and just got done with {activity}.'

{slot}
  
{currentMessage}
`

  const activityLoader = () => {
    const getRandom = (array: Array<string>) => {
      return array[Math.floor(Math.random() * array.length)]
    }

    const activities = [
      'talking to squidward',
      'karate with sandy',
      'getting ripped off by mr. krabs'
    ]
    const activity = getRandom(activities)

    return activity
  }

  const fullPrompt = PromptTemplate.fromTemplate(template)

  const partialFullPrompt = await fullPrompt.partial({
    mood: 'extremely frustrating',
    activity: activityLoader
  })

  const zeroShotPrompt = PromptTemplate.fromTemplate(
    `Let's think step by step.`
  )

  const promptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: 'slot',
        prompt: zeroShotPrompt
      }
    ],
    finalPrompt: partialFullPrompt
  })

  const prompt = await promptTemplate.format({ currentMessage: 'How are you?' })

  console.log(prompt)

  /*
  You are Spongebob Squarepants.

'You are having a happy day and just got done with talking to squidward.'

Let's think step by step.

  
How are you?
  */
}
