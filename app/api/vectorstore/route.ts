import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/serverUtils'
import { SupabaseVectorStore } from 'langchain/vectorstores/supabase'
// import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
// import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts'
import { GoogleGenerativeAIEmbeddings } from '@/lib/utils'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { TaskType, GoogleGenerativeAI } from '@google/generative-ai'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { CSVLoader } from 'langchain/document_loaders/fs/csv'
import { Document } from 'langchain/document'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()

  const formData = await req.formData()
  const index = formData.get('index') as string

  const files = formData.getAll('files') as File[]

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 20000,
    chunkOverlap: 2000
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
  const stringOutputParser = new StringOutputParser()

  const template = `\
  Summarize the following conversation, paying close attention to any keywords and facts:
  {document}
  Summarize the conversation with a concise paragraph. Only include the most important concepts, takeaways, and any actionable advice.`

  const prompt = ChatPromptTemplate.fromMessages([['human', template]])

  // const model = new ChatGoogleGenerativeAI({
  //   modelName: 'gemini-pro',
  //   maxOutputTokens: 4096,
  //   verbose: true
  // })

  const model = new ChatOpenAI({
    modelName: 'gpt-3.5-turbo-0125',
    verbose: true
  })

  const summarizationChain = prompt.pipe(model).pipe(stringOutputParser)

  const documents: Document[] = []

  for (const file of files) {
    const loader = loaderMap(file)
    const splitDocs = await loader.loadAndSplit(splitter)

    const splitDocumentText = splitDocs.map(({ pageContent }) => ({
      document: pageContent
    }))
    console.log(splitDocumentText.length)

    // return
    const responses = await summarizationChain.batch(splitDocumentText)

    const summarizedDocuments = responses.reduce<Document[]>(
      (docs, res, idx) => {
        const summary = new Document({
          pageContent: res,
          metadata: { source: 'huberman', metadata: splitDocs[idx].metadata }
        })
        return docs.concat(summary)
      },
      []
    )
    documents.push(...summarizedDocuments)
  }

  const embeddings = new GoogleGenerativeAIEmbeddings({
    modelName: 'embedding-001',
    taskType: TaskType.RETRIEVAL_DOCUMENT
  })

  const vectorstore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
    client: supabase,
    tableName: index
    // queryName: 'match_documents'
  })

  const res = await vectorstore.addDocuments(documents)

  return NextResponse.json({ res })
}
