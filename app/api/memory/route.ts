import { createSupabaseClient } from '@/lib/serverUtils';
import { NextResponse } from "next/server";


export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const {data: {session}} = await supabase.auth.getSession()
  

  if (!session?.user?.id) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const { messages } = await req.json()

  // const { data, error } = await supabase.from("history").upsert({ history, user_id: session?.user?.id }).select()

  // return NextResponse.json(data)
  return NextResponse.json({messages})

}