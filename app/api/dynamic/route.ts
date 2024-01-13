import { StreamingTextResponse } from 'ai';
 
// import { RemoteRunnable } from "langchain/runnables/remote"
import { BytesOutputParser, StringOutputParser } from 'langchain/schema/output_parser';
import { pull, push } from "langchain/hub";
import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, AIMessagePromptTemplate, MessagesPlaceholder, PipelinePromptTemplate, PromptTemplate } from "langchain/prompts";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { createSupabaseClient } from '@/lib/serverUtils';
import { RunnableSequence, RunnableBranch, RunnableMap, RunnableLambda, RunnablePassthrough } from 'langchain/schema/runnable';
import { NextResponse } from 'next/server';
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { JSONLoader } from "langchain/document_loaders/fs/json";
import { CohereEmbeddings } from "@langchain/cohere";
import { formatDocumentsAsString } from "langchain/util/document";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ScoreThresholdRetriever } from "langchain/retrievers/score_threshold";
import { Document } from 'langchain/document';


export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const {data, error} = await supabase.auth.getSession()
  
  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const { data: documents, error: bucketErr } = await supabase.storage.from('test').download('examples.json')


  if (bucketErr) {
    console.error(bucketErr)
    return new Response('Error', {
      status: 500
    })
  }
  
  const stringParser = new StringOutputParser()
  const bytesParser = new BytesOutputParser()

  const model = new ChatOpenAI({
    modelName: "gpt-4-1106-preview",
    verbose: true,
  });

  const reasoningCharacterPromptTemplate = await pull("jaif/reasoning") as PromptTemplate
  const funnyPromptTemplate = await pull("jaif/funny") as PromptTemplate
  const friendPromptTemplate = await pull("jaif/friend") as PromptTemplate


  //save for later to update supabase
  const json = JSON.parse(await documents.text())

  const loader = new JSONLoader(documents);
  const docs = await loader.load();
  
  const vectorStore = await MemoryVectorStore.fromDocuments(docs, new CohereEmbeddings({model: "embed-english-light-v3.0", inputType: "search_document"}));
  // const vectorStore = await MemoryVectorStore.fromDocuments(docs, new OpenAIEmbeddings());
  
  const retriever = vectorStore.asRetriever(5)
  // const retriever = ScoreThresholdRetriever.fromVectorStore(vectorStore, {
  //   minSimilarityScore: 0.7,
  //   maxK: 5,
  // })
  const standaloneTemplate = `{character}
User Message:
{currentMessage}
Generate a single joke that the user would enjoy. Only include the joke in your response.`

  const standalonePromptTemplate = PromptTemplate.fromTemplate(standaloneTemplate)
  const partialStandalonePrompt = await standalonePromptTemplate.partial({character: funnyPromptTemplate.template})


  const retrieveAndBackup = RunnableSequence.from([
    {
      result: retriever,
      query: new RunnablePassthrough()
    },
    async ({result, query}) => {
      await vectorStore.addDocuments([new Document({pageContent: query})])
      json.text.push(query)
      const jsonFile = new File([JSON.stringify(json, null, 2)], "examples.json", {type: "application/json"})
      await supabase.storage.from('test').update('examples.json', jsonFile, {
        upsert: true
      })
      return result
    }
  ])

  const retrievalChain = partialStandalonePrompt.pipe(model).pipe(stringParser).pipe(retrieveAndBackup).pipe(formatDocumentsAsString)

  const finalTemplate = `{character}{examples}{currentMessage}{response}`
  const finalPrompt = PromptTemplate.fromTemplate(finalTemplate)

  const examples = `
Examples:
Q: The less flexible of the two is _____ leads to it being likely to shatter (A) glass (B) rubber Choose the answer between "glass" and "rubber".
A: "The less flexible of the two is _____ leads to it being likely to shatter". So, glass.
Q: When Rick saw the big cactus that was near him he thought it was massive, but as he got further away it appeared (A) larger (B) smaller Choose the answer between "Cactus far" and "Cactus near".
A: The answer is Cactus near.
Q: A forest is more smooth then a jungle. This means a tiger can run a much greater distance across the (A) jungle (B) forest Choose the answer between "forest" and "jungle".
A: "jungle".
Q: A table is less rough then a lap. Which surface will cause a napkin to heat up more when slid across it? (A) lap (B) table Do not use A and B to answer the question but instead, choose between "table" and "lap".
A: The rationale is that "a table has more friction than a lap".
Q: A hen can run faster then a turkey. If both run from the barn to the shed, which will get there sooner? (A) hen (B) turkey Choose the answer between "hen" and "turkey".
A: The answer is hen.`

  const partialReasoningPromptTemplate = await finalPrompt.partial({
    character: reasoningCharacterPromptTemplate.template,
    examples,
    response: `Response:
Let's think step by step. ` })

  const jokeRetrievalTemplate = `
The following are some of the user's favorite jokes. Use them to understand the user's humor. But make sure the new joke is different!
Jokes:
{jokes}
`
  const jokePromptTemplate = PromptTemplate.fromTemplate(jokeRetrievalTemplate)
  const emptyPromptTemplate = PromptTemplate.fromTemplate(``)

  const composedPartialReasoningPromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: "currentMessage",
        prompt: PromptTemplate.fromTemplate(`\nUser Message:\n{currentMessage}\n`)
      }
    ],
    finalPrompt: partialReasoningPromptTemplate
  })

  const composedFunnyPromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: "character",
        prompt: funnyPromptTemplate,
      },
      {
        name: "examples",
        prompt: jokePromptTemplate
      },
      {
        name: "response",
        prompt: emptyPromptTemplate
      }
    ],
    finalPrompt
  })

  const composedFriendPromptTemplate = new PipelinePromptTemplate({
    pipelinePrompts: [
      {
        name: "character",
        prompt: friendPromptTemplate,
      },
      {
        name: "examples",
        prompt: emptyPromptTemplate
      },
      {
        name: "response",
        prompt: emptyPromptTemplate
      }
    ],
    finalPrompt
  })


  const classificationTemplate = `\
Your job is to classify the user message's intent to select the best prompt.

User Message:
{message}

Option A - {descA}:
{promptA}
Option B - {descB}:
{promptB}
Option C - {descC}:
{promptC}

Only output one char A, B, or C. Always return one of the three options even if you are unsure.
`

  const classificationPrompt = PromptTemplate.fromTemplate(classificationTemplate)
  const classificationPartialPrompt = await classificationPrompt.partial({
    descA: "Reasoning",
    promptA: reasoningCharacterPromptTemplate.template,
    descB: "Funny",
    promptB: funnyPromptTemplate.template,
    descC: "Friend",
    promptC: friendPromptTemplate.template,
  })


  const classificationResultParser = (output: string) => {
    const options = ["A", "B", "C"]
    const classification = output.trim().toUpperCase()

    if (!options.includes(output)) return "C"

    return classification
  } 

  const classificationChain = classificationPartialPrompt.pipe(model).pipe(stringParser).pipe(classificationResultParser)

  const reasoningChain = composedPartialReasoningPromptTemplate
  const funnyChain = RunnableSequence.from([
    {
      currentMessage: ({currentMessage}) => currentMessage,
      jokes: retrievalChain,
    },
    composedFunnyPromptTemplate,
  ])
  const friendlyChain = composedFriendPromptTemplate

  const chainBranch = RunnableBranch.from([
    [({classification}) => classification === "A", reasoningChain],
    [({classification}) => classification === "B", funnyChain],
    [({classification}) => classification === "C", friendlyChain],
    friendlyChain
  ])

  const mainChain = RunnableSequence.from([
    {
      currentMessage: async () => {
        const { messages } = await req.json()
        return  messages[messages.length - 1].content;
      },
    },
    {
      currentMessage: ({currentMessage}) => currentMessage,
      message: ({currentMessage}) => currentMessage,
    },
    {
      classification: classificationChain,
      currentMessage: ({currentMessage}) => currentMessage,
    },
    chainBranch,
    model,
    bytesParser
  ])

  const stream = await mainChain.stream({})

  return new StreamingTextResponse(stream)

}
