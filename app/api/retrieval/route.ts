import { createSupabaseClient } from '@/lib/serverUtils';
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai"; // Replace this with your embedding model
import { NextResponse } from 'next/server';
import { HydeRetriever } from "langchain/retrievers/hyde";
import { ChatOpenAI } from "langchain/chat_models/openai";


export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const {data, error} = await supabase.auth.getSession()
  
  
  const { query, number, index } = await req.json()
  
  if (!data.session?.user && index !== 'demo') {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  
  
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

    const llm = new ChatOpenAI({verbose: true});
  
    const retriever = new HydeRetriever({
      vectorStore,
      llm,
      k: number,
      verbose: true,
    });

  const documents = await retriever.getRelevantDocuments(query);

  return NextResponse.json({documents})
}
