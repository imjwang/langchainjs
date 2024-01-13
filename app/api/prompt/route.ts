import { StreamingTextResponse } from 'ai';
 
// import { RemoteRunnable } from "langchain/runnables/remote"
import { BytesOutputParser, StringOutputParser } from 'langchain/schema/output_parser';
import { pull, push } from "langchain/hub";
import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, AIMessagePromptTemplate, MessagesPlaceholder, PipelinePromptTemplate, PromptTemplate } from "langchain/prompts";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { createSupabaseClient } from '@/lib/serverUtils';
import { RunnableSequence, RunnableBranch, RunnableMap, RunnableLambda } from 'langchain/schema/runnable';
import { NextResponse } from 'next/server';

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const {data, error} = await supabase.auth.getSession()
  
  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }


  const moods = ["happy", "sad", "melodramatic", "crazy"]

  const getRandomMood = (moods: Array<string>) => {
    return moods[Math.floor(Math.random() * moods.length)];
  }
  
  
  const { messages } = await req.json()
  const currentMessage = messages[messages.length - 1].content;
  
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
  const nestedCharacterPrompt = PromptTemplate.fromTemplate(nestedCharacterTemplate)

  const universeTemplate = `This takes part in a universe where {universeEvent}. It is a {universeDescription}.`
  const universePrompt = PromptTemplate.fromTemplate(universeTemplate)

  const zeroShotPrompt = PromptTemplate.fromTemplate(`Let's think {thoughtPolicy}.`)
  
  const nestedPromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: "slot",
        prompt: zeroShotPrompt
      },
    ],
    finalPrompt: nestedCharacterPrompt,
  })

  const formattedNestedPrompt = await nestedPromptTemplate.partial({mood: getRandomMood(moods), activity: "biking with squidward"})

  const finalPromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: "worldDescriptionPrompt",
        prompt: universePrompt
      },
      {
        name: "characterPrompt",
        prompt: formattedNestedPrompt
      },
    ],
    finalPrompt: fullPrompt,
  })

  const piratePrompt = PromptTemplate.fromTemplate(`Respond like a cantakerous pirate. {currentMessage}`)
  const generalPrompt = PromptTemplate.fromTemplate(`You are a helpful assistant beep boop. {currentMessage}`)
  const lovePrompt = PromptTemplate.fromTemplate(`Respond like a tsundere love interest. {currentMessage}`)

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
    return options[Math.floor(Math.random() * options.length)];
  }

  const lambdaMap = RunnableLambda.from(({pirate, love, general}) => {
      return random([pirate, love, general])
  })


  // const prompt = await finalPromptTemplate.format({mood: "happy", activity: "talking to squidward", currentMessage: "How are you?", thoughtPolicy: "step by step"})


  const model = new ChatOpenAI({
    modelName: "gpt-4-1106-preview",
    verbose: true,
  });

  const outputParser = new BytesOutputParser();

  const pirateChain = piratePrompt.pipe(model).pipe(outputParser);
  const loveChain = lovePrompt.pipe(model).pipe(outputParser);
  const generalChain = generalPrompt.pipe(model).pipe(outputParser);

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
    outputParser,
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

  const promptTemplate = PromptTemplate.fromTemplate(`Respond like a tsundere love interest. Mention that you are busy and the current time is {time}. {currentMessage}`)
  const getPartialTemplate = async () => await promptTemplate.partial({time: new Date().toLocaleTimeString('en-US')})
  const chain3 = RunnableSequence.from([
    getPartialTemplate,
    model,
    outputParser,
  ])

  const stream = await chain3.stream({currentMessage})

  return new StreamingTextResponse(stream)

}
