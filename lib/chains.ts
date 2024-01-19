"use server"

import { Message } from 'ai';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { RunnableSequence } from "langchain/schema/runnable";
import { revalidatePath } from "next/cache";
import { BedrockChat } from "langchain/chat_models/bedrock";
import { StringOutputParser } from "langchain/schema/output_parser";
import { XMLParser } from "fast-xml-parser"
import { getExamples, createExamplesFromArray } from '@/app/langsmith-actions';


export async function getSaveObject(messages: Message[]) {
  const parser = StructuredOutputParser.fromNamesAndDescriptions({
    title: "summary of conversation, should be a short sentence.",
    topic: "topic of conversation, should be one word.",
    color: "give the conversation a color depending on the contents, should be a hex color code.",
    emotion: "emotional summary of the conversation, should be a series of 3 emojis.",
  });
  
  const chain = RunnableSequence.from([
    {
      parseInstructions: () => parser.getFormatInstructions(),
      messages: (input: {messages: Message[]}) => {
        return input.messages?.map(({role, content}) => `${role}: ${content}`).join("\n");
      },
    }
    ,
    PromptTemplate.fromTemplate(
      "Please analyze the following conversation:\n{messages}\n{parseInstructions}"
    ),
    new ChatOpenAI(),
    parser,
  ]);
    
  const response = await chain.invoke({
    messages,
  });
  
  return response;
}


export async function createJokes(datasetId: string | undefined) {
  if (!datasetId) {
    return "No dataset found"
  }

  const examples = await getExamples(datasetId)

  if (examples.length >= 20) {
    return "Dataset limit reached."
  }

  const template = `\
Produce 5 exemplary jokes about {topic}. Here is an example joke:
<example>"Why can't a bicycle stand up by itself? Because it's two-tired!"</example>
`
  const promptTemplate = PromptTemplate.fromTemplate(template)

  const model = new BedrockChat({
    model: "anthropic.claude-v2:1",
    region: "us-east-1",
    maxTokens: 1000,
    credentials: {
      accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
    }
  })

  const chain = RunnableSequence.from([
    promptTemplate,
    model,
    new StringOutputParser(),
  ])

  const results = await chain.batch([{topic: "AI"}, {topic: "javascript"}, {topic: "animals"}, {topic: "food"}])

  const parser = new XMLParser()
  const parsedResults = results.map((result: string) => parser.parse(result))
  const combinedResults = parsedResults.reduce((acc: any[], cur: any) => {
    if (!cur.joke) {
      return acc
    }
    return [...acc, ...cur.joke]
  }
  , []) as string[]

  const uniqueGeneratedJokes = Array.from(new Set(combinedResults))

  const cleanedGeneratedJokes = uniqueGeneratedJokes.filter((joke: string) => !examples.includes(joke) && joke != undefined)

  const res = await createExamplesFromArray(cleanedGeneratedJokes, datasetId)

  revalidatePath('/')
  return res
}
