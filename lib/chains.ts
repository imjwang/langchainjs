'use server'

import { Message } from 'ai'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { PromptTemplate } from 'langchain/prompts'
import { StructuredOutputParser } from 'langchain/output_parsers'
import { RunnableSequence } from 'langchain/schema/runnable'
import { revalidatePath } from 'next/cache'
import { BedrockChat } from 'langchain/chat_models/bedrock'
import {
  FormatInstructionsOptions,
  StringOutputParser,
  OutputParserException
} from 'langchain/schema/output_parser'
import { XMLParser } from 'fast-xml-parser'
import { getExamples, createExamplesFromArray } from '@/app/langsmith-actions'
import { BaseOutputParser } from 'langchain/schema/output_parser'
import { RunCollectorCallbackHandler } from 'langchain/callbacks'
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document'
import { formatDocumentsAsString } from 'langchain/util/document'
import { TaskType } from '@google/generative-ai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { createSupabaseClient } from '@/lib/serverUtils'
import { SupabaseDocstore } from '@/lib/utils'
import { SupabaseVectorStore } from 'langchain/vectorstores/supabase'

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
    title: 'summary of conversation, should be a short sentence.',
    topic: 'topic of conversation, should be one word.',
    color:
      'give the conversation a color depending on the contents, should be a hex color code.',
    emotion:
      'emotional summary of the conversation, should be a series of 3 emojis.'
  })

  const chain = RunnableSequence.from([
    {
      parseInstructions: () => parser.getFormatInstructions(),
      messages: (input: { messages: Message[] }) => {
        return input.messages
          ?.map(({ role, content }) => `${role}: ${content}`)
          .join('\n')
      }
    },
    PromptTemplate.fromTemplate(
      'Please analyze the following conversation:\n{messages}\n{parseInstructions}'
    ),
    new ChatOpenAI(),
    parser
  ])

  const response = await chain.invoke({
    messages
  })

  return response
}

export async function createJokes(datasetId: string | undefined) {
  if (!datasetId) {
    return {
      message: 'No dataset found',
      jokes: [],
      id: ''
    }
  }

  const examples = await getExamples(datasetId)

  const template = `\
Produce 5 exemplary jokes about {topic}. Here is an example joke:
<example>"Why can't a bicycle stand up by itself? Because it's two-tired!"</example>
Please output your jokes in <joke></joke> XML tags.
`
  const promptTemplate = PromptTemplate.fromTemplate(template)

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

  const parser = new XMLParser()

  const chain = RunnableSequence.from([
    promptTemplate,
    model,
    new StringOutputParser(),
    text => parser.parse(text)
  ])

  const runCollector = new RunCollectorCallbackHandler()
  const results = await chain.batch(
    [
      { topic: 'AI' },
      { topic: 'javascript' },
      { topic: 'animals' },
      { topic: 'food' }
    ],
    { callbacks: [runCollector] }
  )

  try {
    const parsedResults = runCollector.tracedRuns[0]?.outputs?.output.reduce(
      (acc: any[], cur: any) => {
        if (!cur.joke) {
          return acc
        }
        return [...acc, ...cur.joke]
      },
      []
    ) as string[]

    const uniqueParsedJokes = Array.from(new Set(parsedResults))
    const newParsedJokes = uniqueParsedJokes.filter(
      (joke: string) =>
        !examples.includes(joke) &&
        joke != undefined &&
        joke !== typeof 'string'
    )

    return {
      jokes: newParsedJokes,
      id: runCollector.tracedRuns[0].id,
      message: 'ok'
    }
  } catch (e) {
    return {
      message: 'No jokes created.',
      jokes: [],
      id: ''
    }
  }
}

const hydeModel = new ChatOpenAI({
  modelName: 'gpt-3.5-turbo-0125',
  verbose: true
})

const summaryEmbeddings = new GoogleGenerativeAIEmbeddings({
  modelName: 'embedding-001',
  taskType: TaskType.RETRIEVAL_QUERY
})

const summaryPrompt = PromptTemplate.fromTemplate(`Question:
{question}
Please write a concise summary of a podcast between health professionals that addresses the question. \
The summary should include the most important takeaways and actionable advice.
`)

async function getHydeRetriever(k: number, fetchK: number) {
  const client = createSupabaseClient()
  const summaryVectorstore = await SupabaseVectorStore.fromExistingIndex(
    summaryEmbeddings,
    {
      client,
      tableName: 'healthsummary', // name of my table
      queryName: 'match_summary_documents' // name of my query function
    }
  )
  return summaryVectorstore.asRetriever({
    k,
    searchKwargs: {
      fetchK,
      lambda: 0.5
    }
    // filter: {
    //   source: 'huberman'
    // }
  })
}

export async function getHydeChain(k: number, fetchK: number) {
  return RunnableSequence.from([
    summaryPrompt,
    hydeModel,
    new StringOutputParser(),
    async () => await getHydeRetriever(k, fetchK),
    formatDocumentsAsString
  ])
}

const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
  dimensions: 1024
})

async function getParentChildRetriever(k: number, source: string = 'huberman') {
  const client = createSupabaseClient()
  const vectorstore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
    client,
    tableName: 'podcasts', // name of my table
    queryName: 'match_podcasts_documents' // name of my query function
  })
  //@ts-ignore
  const docstore = new SupabaseDocstore(client, 'parent_documents') as BaseStore
  //@ts-ignore
  const retriever = new ParentDocumentRetriever({
    childDocumentRetriever: vectorstore.asRetriever({
      k: k * 2,
      filter: {
        source
      }
    }),
    idKey: 'parent_id',
    docstore,
    parentK: k // because the chunks
  })
  return retriever
}

export async function getParentDocumentsChain(
  k: number,
  source: 'lex' | 'huberman'
) {
  return RunnableSequence.from([
    ({ question }) => question,
    async () => await getParentChildRetriever(k, source),
    formatDocumentsAsString
  ])
}
