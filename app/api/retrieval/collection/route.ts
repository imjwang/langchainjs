import { createSupabaseClient } from '@/lib/serverUtils';
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createSupabaseClient()
  const {data: {session}} = await supabase.auth.getSession()

  if (!session?.user?.id) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const { data, error } = await supabase.from("dataset").select()

  if (error) {
    return NextResponse.json({error})
  }

  return NextResponse.json({data})

}

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const {data: {session}} = await supabase.auth.getSession()

  if (!session?.user?.id) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const { tableName } = await req.json()

  const { error } = await supabase.rpc('create_documents_table', { table_name: tableName })

  if (error) {
    return NextResponse.json({error})
  }

  const { error: indexError } = await supabase.rpc('create_hnsw_index', { table_name: tableName })

  if (indexError) {
    return NextResponse.json({indexError})
  }

  const { error: collectionsError, data } = await supabase.from("dataset").insert({ collection_name: tableName, user_id: session?.user?.id }).select()

  if (indexError) {
    return NextResponse.json({collectionsError})
  }

  return NextResponse.json({message: 'success', data}, { status: 201 })

}