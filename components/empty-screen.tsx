import { UseChatHelpers } from 'ai/react'

import { Button } from '@/components/ui/button'
import { IconArrowRight } from '@/components/ui/icons'
import Link from 'next/link'

const exampleMessages = [
  {
    heading: 'Explain technical concepts',
    message: `What is a "serverless function"?`
  },
  {
    heading: 'Summarize an article',
    message: 'Summarize the following article for a 2nd grader: \n'
  },
  {
    heading: 'Draft an email',
    message: `Draft an email to my boss about the following: \n`
  }
]

export function EmptyScreen({ setInput }: Pick<UseChatHelpers, 'setInput'>) {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="rounded-lg border bg-background p-8">
        <h1 className="mb-2 text-lg font-semibold">
          Welcome to Langchain.js Bootcamp!
        </h1>
        <p className="leading-normal text-muted-foreground">
          You can test out document retrieval and creating indexes with:
        </p>
        <Link href="/retriever">
          <Button>
             Retrieval Playground
          </Button>
        </Link>
        <p className="leading-normal text-muted-foreground text-sm italic">
          You must be logged in to create indexes and query them, however, there is currently a demo dataset.
        </p>
        <p className="leading-normal text-muted-foreground">
          Link to Joke rater for module 2:
        </p>
        <Link href="/jokes">
          <Button className="bg-rose-400">
             Joke Rater
          </Button>
        </Link>
        <p className="leading-normal text-muted-foreground text-sm italic">
          You need a langsmith account for this to work, it is currently set to mine.
        </p>
        <p className="leading-normal text-muted-foreground pt-4">
          You can start a conversation here or try the following examples:
        </p>
        <div className="mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-base"
              onClick={() => setInput(message.message)}
            >
              <IconArrowRight className="mr-2 text-muted-foreground" />
              {message.heading}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
