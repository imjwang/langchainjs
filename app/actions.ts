'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseClient } from '@/lib/serverUtils'
import { type Chat } from '@/lib/types'
import type { Message } from 'ai'
import { usePathname, useRouter } from 'next/navigation'

export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  const supabase = createSupabaseClient()

  try {
    const { data, error } = await supabase.from('history').select('*')

    return data as Chat[]
  } catch (error) {
    return []
  }
}

export async function getChat(id: string) {
  const supabase = createSupabaseClient()

  const { data, error } = await supabase.from('history').select().eq('id', id)

  if (data === null) {
    return null
  }

  return data[0] as Chat
}

export async function removeChat(id: string) {
  const supabase = createSupabaseClient()
  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return {
      error: 'Unauthorized'
    }
  }

  const { data, error } = await supabase
    .from('history')
    .delete()
    .eq('id', id)
    .select()

  const uid = data?.[0]?.user_id

  if (uid !== session?.user?.id) {
    return {
      error: 'Unauthorized'
    }
  }

  revalidatePath('/')
  return revalidatePath(`/chat/${id}`)
}

export async function saveChat(messages: Messages[], id: string | undefined) {
  const supabase = createSupabaseClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('history')
    .upsert({ id, messages, user_id: user?.id })
    .select()

  if (!data) return 'error'

  return data[0].id
}

export async function clearChats() {
  // const session = await auth()
  // if (!session?.user?.id) {
  //   return {
  //     error: 'Unauthorized'
  //   }
  // }
  // const chats: string[] = await kv.zrange(`user:chat:${session.user.id}`, 0, -1)
  // if (!chats.length) {
  // return redirect('/')
  // }
  // const pipeline = kv.pipeline()
  // for (const chat of chats) {
  //   pipeline.del(chat)
  //   pipeline.zrem(`user:chat:${session.user.id}`, chat)
  // }
  // await pipeline.exec()
  // revalidatePath('/')
  // return redirect('/')
}

export async function getSharedChat(id: string) {
  // const chat = await kv.hgetall<Chat>(`chat:${id}`)
  // if (!chat || !chat.sharePath) {
  //   return null
  // }
  // return chat
}

// TODO add a new public table
export async function shareChat(chat: Chat) {
  // const session = await auth()
  // if (!session?.user?.id || session.user.id !== chat.userId) {
  //   return {
  //     error: 'Unauthorized'
  //   }
  // }
  // const payload = {
  //   ...chat,
  //   sharePath: `/share/${chat.id}`
  // }
  // await kv.hmset(`chat:${chat.id}`, payload)
  // return payload
}
