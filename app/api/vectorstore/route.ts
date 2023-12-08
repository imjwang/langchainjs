import { NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/serverUtils";
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

//  TODO create a similarity seach route
// export async function GET() {
//   const supabase = createSupabaseClient()

//   const vectorstore = await SupabaseVectorStore.fromExistingIndex(
//     new OpenAIEmbeddings(), 
//   {
//     client: supabase,
//     tableName: "documents",
//     queryName: "match_documents"
//   }
//   )

//   const query = "H"

//   const data = await vectorstore.similaritySearch(query, 1)

//   console.log(data)

//   return NextResponse.json(data)
// }

export async function POST(req: Request) {
  const supabase = createSupabaseClient()

  
  const formData = await req.formData()
  const index = formData.get('index') as string
  
  const files = formData.getAll('files')
  
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2000,
    chunkOverlap: 200,
  });
  
  
  const documents = []
  
  for (const file of files) {
    const loader = new TextLoader(file)
    const splitDocs = await loader.loadAndSplit(splitter)
    documents.push(...splitDocs)
  }

  const vectorstore = await SupabaseVectorStore.fromExistingIndex(
    new OpenAIEmbeddings(), 
  {
    client: supabase,
    tableName: index,
    queryName: "match_documents"
  }
  )

  const res = await vectorstore.addDocuments(documents)

  // console.log(res)

  return NextResponse.json(res)

  // return NextResponse.json({message: "ok"})
}
