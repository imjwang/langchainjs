'use client'

import { useChat, experimental_useAssistant as useAssistant, type Message } from 'ai/react'

import { cn } from '@/lib/utils'
import { ChatList } from '@/components/chat-list'
import { ChatPanel } from '@/components/chat-panel'
import { EmptyScreen } from '@/components/empty-screen'
import { ChatScrollAnchor } from '@/components/chat-scroll-anchor'
import { type Chat } from '@/lib/types'
import { toast } from 'react-hot-toast'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'
import { getSaveObject } from '@/lib/chains'


const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface ChatProps extends React.ComponentProps<'div'> {
  initialMessages?: Message[]
  id?: string
}

export function Chat({ id, initialMessages, className }: ChatProps) {
  const router = useRouter()
  const path = usePathname()
  const [saveChat, setSaveChat] = useState(false)
  // for chain select
  const [chain, setChain] = useState('/api/chat')
  const [index, setIndex] = useState('demo')
  const [push, setPush] = useState(false)
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(undefined)
  // for retrieval
  const [sourcesForMessages, setSourcesForMessages] = useState<
    Record<string, any>
  >({})

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      api: chain,
      initialMessages,
      id,
      body: {
        id,
        chain,
        index,
        pushToHub: push,
      },
      onResponse(response) {
        if (response.status === 401) {
          toast.error(response.statusText)
        }
        const sourcesHeader = response.headers.get('x-sources')
        const sources = sourcesHeader ? JSON.parse(atob(sourcesHeader)) : []
        const messageIndexHeader = response.headers.get('x-message-index')
        if (sources.length && messageIndexHeader !== null) {
          setSourcesForMessages({
            ...sourcesForMessages,
            [messageIndexHeader]: sources
          })
        }
      },
      onFinish: () => setSaveChat(true)
    })


  // const { status, messages, input, submitMessage, handleInputChange, setInput, threadId } = useAssistant({
  //   api: chain,
  //   threadId: currentThreadId
  // })

  // useEffect(() => {
  //   setCurrentThreadId(threadId)
  // }, [threadId])

  // const isLoading = status === 'in_progress'


  useEffect(() => {
    const t = async () => {
      setSaveChat(false)
      const {
        data: { user }
      } = await supabase.auth.getUser()
      const output = await getSaveObject(messages)
      const { data, error } = await supabase
        .from('history')
        .upsert({ id, messages, user_id: user?.id, ...output })
        .select()
      if (!data) return

      const { id: messageId } = data[0] as Chat

      if (!path.includes('chat')) {
        router.push(`/chat/${messageId}`)
        router.refresh()
      }
    }
    if (saveChat) t()
  }, [saveChat, messages, path, router, id])

  return (
    <>
      <div className={cn('pb-[200px] pt-4 md:pt-10', className)}>
        {messages.length ? (
          <>
            <ChatList
              messages={messages}
              sourcesForMessages={sourcesForMessages}
            />
            <ChatScrollAnchor trackVisibility={isLoading} />
          </>
        ) : (
          <EmptyScreen setInput={setInput} />
        )}
      </div>
      <ChatPanel
        id={id}
        isLoading={isLoading}
        stop={stop}
        append={append}
        reload={reload}
        // submitMessage={submitMessage}
        // submitMessage={submitMessage}
        // handleInputChange={handleInputChange}
        handleInputChange={setInput}
        messages={messages}
        input={input}
        setInput={setInput}
        chain={chain}
        setChain={setChain}
        index={index}
        setIndex={setIndex}
        push={push}
        setPush={setPush}
      />
    </>
  )
}
