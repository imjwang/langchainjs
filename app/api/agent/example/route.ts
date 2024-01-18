import { NextResponse } from 'next/server';
import { StreamingTextResponse, Message, LangChainStream } from 'ai';

import { formatLogToString } from "langchain/agents/format_scratchpad/log";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { AgentExecutor, ZeroShotAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "langchain/prompts";
import { Tool } from "langchain/tools";
import { WebBrowser } from "langchain/tools/webbrowser";
import { RunnableSequence } from "langchain/schema/runnable";
import { Calculator } from "langchain/tools/calculator";
import { createSupabaseClient } from '@/lib/serverUtils';
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai"; // Replace this with your embedding model
import { DynamicTool } from "langchain/tools";
import { formatDocumentsAsString } from "langchain/util/document";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { DynamicStructuredTool, formatToOpenAITool, formatToOpenAIFunction } from "langchain/tools";
import { z } from "zod";
import { OpenAIFunctionsAgentOutputParser } from "langchain/agents/openai/output_parser";
import { convertToOpenAIFunction } from "@langchain/core/utils/function_calling";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  AgentStep,
  BaseMessage,
  FunctionMessage
} from "langchain/schema";
import { BufferMemory, ChatMessageHistory } from "langchain/memory";


const formatMessage = (message: Message) => {
  if (message.role === 'system') {
    return new SystemMessage(message.content);
  }
  else if (message.role === 'user') {
    return new HumanMessage(message.content);
  } else {
    return new AIMessage(message.content);
  }
};



export const runtime = 'edge'


export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  
  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }
  
  const { messages, index, } = await req.json()
  
  const vectorStore = await SupabaseVectorStore.fromExistingIndex(
    new OpenAIEmbeddings(), 
    {
      client: supabase,
      tableName: index,
      queryName: "match_documents",
      filter: {
        index
      }
    }
    )

    
  const retriever = vectorStore.asRetriever(4)

  async function getRelevantDocuments(input: { query: string }) {
    const relevantDocs = await retriever.getRelevantDocuments(input.query);
    const serialized = formatDocumentsAsString(relevantDocs);
    return serialized;
  }

  const collectionDescription = 'This is a collection of transcripts from a health and fitness podcast'

  
  // const retrieverTool = new DynamicTool({
  //     name: 'vectorstore',
  //     description: `call this to get relevent information from a vectorstore with the following description:\n${collectionDescription}\nThe input should be an object with a query property`,
  //     func: getRelevantDocuments,
  //   })

    // const a = formatToOpenAITool(retrieverTool)

    const structuredStructuredTool = new DynamicStructuredTool({
      name: "vectorstore",
      description: `returns relevent information from a vectorstore with the following description:\n${collectionDescription}`,
      func: getRelevantDocuments,
      schema: z.object({
        query: z.string().describe("The query to use for semantic search."),
      }),
    });
    
    const b = formatToOpenAITool(structuredStructuredTool)

    const tools = [
      structuredStructuredTool,
      new Calculator(),
    ];

    // console.log("a", a)
    console.log("b", b)

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are a helpful friend and medical professional."],
      new MessagesPlaceholder("chatHistory"),
      ["human", "{input}"],
      new MessagesPlaceholder("agentScratchpad"),
    ]);

    const previousMessages = messages.slice(0, -1);
    const currentMessageContent = messages[messages.length - 1].content;

    const memory = new BufferMemory({
      memoryKey: "history", // The object key to store the memory under
      inputKey: "question", // The object key for the input
      outputKey: "answer", // The object key for the output
      returnMessages: true,
      chatHistory: new ChatMessageHistory(previousMessages?.map(formatMessage))
    });

        
    const model = new ChatOpenAI({
      temperature: 0,
      modelName: "gpt-4-1106-preview",
      // streaming: true,
      verbose: true,
    });


    const formatAgentSteps = (steps: AgentStep[]): BaseMessage[] =>
    steps.flatMap(({ action, observation }) => {
      if ("messageLog" in action && action.messageLog !== undefined) {
        const log = action.messageLog as BaseMessage[];
        return log.concat(new FunctionMessage(observation, action.tool));
      } else {
        return [new AIMessage(action.log)];
      }
    });

    const modelWithFunctions = model.bind({
      functions: [...tools.map((tool) => convertToOpenAIFunction(tool))],
    });

    const runnableAgent = RunnableSequence.from([
      {
        input: (i: { input: string; steps: AgentStep[] }) => i.input,
        agentScratchpad: (i: { input: string; steps: AgentStep[] }) =>
          formatAgentSteps(i.steps),
        // Load memory here
        chatHistory: async (i: { input: string; steps: AgentStep[] }) => {
          const { history } = await memory.loadMemoryVariables({});
          return history;
        },
      },
      prompt,
      modelWithFunctions,
      new OpenAIFunctionsAgentOutputParser(),
    ]);
    
    const executor = AgentExecutor.fromAgentAndTools({
      agent: runnableAgent,
      tools,
      verbose: true,
    });



    const result = await executor.invoke({input: currentMessageContent})

    await memory.saveContext(
      {
        question: currentMessageContent,
      },
      {
        answer: result.output,
      }
    );


    /**
     * Agent executors don't support streaming responses (yet!), so stream back the
     * complete response one character at a time with a delay to simluate it.
     */
        const textEncoder = new TextEncoder();
        const fakeStream = new ReadableStream({
          async start(controller) {
            for (const character of result.output) {
              controller.enqueue(textEncoder.encode(character));
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
            controller.close();
          },
        });
    
    return new StreamingTextResponse(fakeStream);
    
}
