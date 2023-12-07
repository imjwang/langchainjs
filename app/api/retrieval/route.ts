import { createSupabaseClient } from '@/lib/serverUtils';
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai"; // Replace this with your embedding model
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

  const { messages } = await req.json()

  console.log(messages)
  const currentMessageContent = messages[messages.length - 1].content;
  console.log(currentMessageContent)
  const vectorstore = await SupabaseVectorStore.fromExistingIndex(
    new OpenAIEmbeddings(), 
    {
      client: supabase,
      tableName: "documents",
      queryName: "match_documents"
    }
  )

  const retriever = vectorstore.asRetriever(5)
  const documents = await retriever.getRelevantDocuments(currentMessageContent)

  return NextResponse.json({documents})
}
