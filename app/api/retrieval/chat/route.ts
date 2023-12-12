// ai sdk
import { StreamingTextResponse, Message } from 'ai';
// chat
import { ChatOpenAI } from "langchain/chat_models/openai";
import { BytesOutputParser } from 'langchain/schema/output_parser';
// prompt
import { ChatPromptTemplate, MessagesPlaceholder } from "langchain/prompts";
import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";
import { createSupabaseClient } from '@/lib/serverUtils';
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai"; // Replace this with your embedding model
import { HydeRetriever } from "langchain/retrievers/hyde";
// chain
import { RunnableSequence } from "langchain/schema/runnable";
import { formatDocumentsAsString } from "langchain/util/document";

export const runtime = 'edge'


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

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  
  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }
  
  const { messages, index } = await req.json()

  const model = new ChatOpenAI();
  
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

    const retriever = new HydeRetriever({
      vectorStore,
      llm: model,
      k: 4,
      verbose: true,
    });



  const previousMessages = messages.slice(0, -1);
  const currentMessageContent = messages[messages.length - 1].content;
  

  const humanTemplate = `Use the following pieces of context to answer the question at the end. If you don't know the answer, just say that you don't know, don't try to make up an answer. 
  Context:
  {context}
  Question:
  {question}`

  const systemTemplate = `You are a helpful friend and medical professional.`

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemTemplate],
    new MessagesPlaceholder("chatHistory"),
    ["human", humanTemplate],
    ["ai", "Let's think step by step."],
  ])

  const chain = RunnableSequence.from([
    {
      question: (input: { question: string; previousMessages: Message[] }) =>
        input.question,
      chatHistory: (input: { question: string; previousMessages: Message[] }) => {
        return input.previousMessages?.map(formatMessage)
      },
      context: async (input: { question: string; previousMessages: Message[] }) => {
        const relevantDocs = await retriever.getRelevantDocuments(input.question);
        const serialized = formatDocumentsAsString(relevantDocs);
        return serialized;
      },
    },
    prompt,
    model,
    new BytesOutputParser(),
  ]);

  const stream = await chain.stream({question: currentMessageContent, previousMessages})

  return new StreamingTextResponse(stream)
}
