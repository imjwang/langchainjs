import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/serverUtils'
import { SupabaseVectorStore } from 'langchain/vectorstores/supabase'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { CSVLoader } from 'langchain/document_loaders/fs/csv'

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()

  const formData = await req.formData()
  const index = formData.get('index') as string

  const files = formData.getAll('files') as File[]

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2000,
    chunkOverlap: 300
  })

  const loaderMap = (file: File) => {
    switch (file.type) {
      case 'application/pdf':
        return new PDFLoader(file)
      case 'text/plain':
        return new TextLoader(file)
      case 'text/csv':
        return new CSVLoader(file)
      default:
        return new TextLoader(file)
    }
  }

  const documents = []

  for (const file of files) {
    const loader = loaderMap(file)
    const splitDocs = await loader.loadAndSplit(splitter)
    documents.push(...splitDocs)
  }

  const vectorstore = await SupabaseVectorStore.fromExistingIndex(
    new OpenAIEmbeddings(),
    {
      client: supabase,
      tableName: index,
      queryName: 'match_documents'
    }
  )

  const res = await vectorstore.addDocuments(documents)

  return NextResponse.json(res)
}
