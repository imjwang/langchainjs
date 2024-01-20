"use server"

import { Message } from 'ai';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { RunnableSequence } from "langchain/schema/runnable";
import { revalidatePath } from "next/cache";
import { BedrockChat } from "langchain/chat_models/bedrock";
import { FormatInstructionsOptions, StringOutputParser, OutputParserException } from "langchain/schema/output_parser";
import { XMLParser } from "fast-xml-parser"
import { getExamples, createExamplesFromArray } from '@/app/langsmith-actions';
import { BaseOutputParser } from 'langchain/schema/output_parser';
import { RunCollectorCallbackHandler } from "langchain/callbacks";


// export interface XMLParserFields {
//   fields: string;
//   outputKeys: string[];
//   defaultOutputKey?: string;
// }

// class XMLParser extends BaseOutputParser<Record<string, string>> {
//   static lc_name() {
//     return "XMLParser";
//   }

//   lc_namespace = ["langchain", "output_parsers", "XML"];

//   lc_serializable: true;

//   get lc_attributes(): any | undefined {
//     return {
//       fields: this.lc_kwargs.fields,
//     };
//   }

//   outputKeys: string[];

//   defaultOutputKey?: string;

//   parser: FastXMLParser;

//   constructor(
//     fields: string,
//     outputKeys: string[],
//     defaultOutputKey?: string
//   )

//   constructor(
//     fields: string | XMLParserFields,
//     outputKeys?: string[],
//     defaultOutputKey?: string,
//   ) {
//     if (typeof fields === "string") {
//       // eslint-disable-next-line no-param-reassign, @typescript-eslint/no-non-null-assertion
//       fields = { fields, outputKeys: outputKeys!, defaultOutputKey};
//     }

//     super(fields);
//     this.parser = new FastXMLParser();
//   }

//   _type() {
//     return "xml_parser";
//   }

//   async parse(text: string): Promise<Record<string, string>> {

//     try {
//       const parsed = this.parser.parse(text, true);
//       return this.outputKeys.reduce((acc, key) => {
//         acc[key] 
//       })
//     } catch (e) {
//       throw new OutputParserException(`Could not parse output: ${text}`, text);
//     }
//     const output: Record<string, string> = {};
//     for (const key of this.lc_kwargs.outputKeys) {
//       output[key] = parsed[key];
//     }

//     if (this.defaultOutputKey === undefined) {
//       throw new OutputParserException(`Could not parse output: ${text}`, text);
//     }


//     return output;
//   }

//   getFormatInstructions(options?: FormatInstructionsOptions | undefined): string {
//     return `Parse the following XML: ${this.lc_kwargs.fields}`;
//   }
  
//   const parsedResults = results.map((result: string) => parser.parse(result))
// } 



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
    return {
      message: "No dataset found"
    }
  }

  const examples = await getExamples(datasetId)

  if (examples.length >= 20) {
    return {
      message: "Dataset limit reached."
    }
  }

  const template = `\
Produce 5 exemplary jokes about {topic}. Here is an example joke:
<example>"Why can't a bicycle stand up by itself? Because it's two-tired!"</example>
Please output your jokes in <joke></joke> XML tags.
`
  const promptTemplate = PromptTemplate.fromTemplate(template)

  const model = new BedrockChat({
    model: "anthropic.claude-v2:1",
    region: "us-east-1",
    maxTokens: 1000,
    temperature: 0.9,
    credentials: {
      accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
    }
  })

  const parser = new XMLParser()

  const chain = RunnableSequence.from([
    promptTemplate,
    model,
    new StringOutputParser(),
    (text) => parser.parse(text),
  ])

  const runCollector = new RunCollectorCallbackHandler()
  const results = await chain.batch([
    {topic: "AI"},
    {topic: "javascript"},
    {topic: "animals"},
    {topic: "food"}
  ],
    {callbacks: [runCollector]}
  )

  try {
    const parsedResults = runCollector.tracedRuns[0]?.outputs?.output.reduce((acc: any[], cur: any) => {
      if (!cur.joke) {
        return acc
      }
      return [...acc, ...cur.joke]
    }, []) as string []

    const uniqueParsedJokes = Array.from(new Set(parsedResults))
    const newParsedJokes = uniqueParsedJokes.filter((joke: string) => !examples.includes(joke) && joke != undefined && joke !== typeof "string")

    return {
      jokes: newParsedJokes,
      id: runCollector.tracedRuns[0].id
    }

  } catch (e) {
    return {
      message: "No jokes created."
    }
  }

  const parsedResults = results.reduce((acc, cur) => {
    if (!cur.joke) {
      return acc
    }
    return [...acc, ...cur.joke]
  }, []) as string []
  
  const uniqueParsedJokes = Array.from(new Set(parsedResults))
  
  const newParsedJokes = uniqueParsedJokes.filter((joke: string) => !examples.includes(joke) && joke != undefined && joke !== typeof "string")
  
  const res = await createExamplesFromArray(newParsedJokes, datasetId)
  
  revalidatePath('/')
  return res
}
