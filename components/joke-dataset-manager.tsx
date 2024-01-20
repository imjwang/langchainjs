'use client'

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { createExample, getExamples, handleFeedback, getDatasetStatus } from "@/app/langsmith-actions";
import { type Dataset } from "langsmith";
import { useFormState } from 'react-dom'
import { createJokes } from "@/lib/chains";


type JokeRaterProps = {
  jokesDatasetId: string | undefined;
  flopsDatasetId: string | undefined;
  checkDataset: () => void;
}

function JokeRater({ jokesDatasetId, flopsDatasetId, checkDataset }: JokeRaterProps) {
  const [currentIdx, setCurrentIdx] = useState(1)
  const [runId, setRunId] = useState<string>("")
  const [jokes, setJokes] = useState<string[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  
  const handleCreateJokes = async () => {
    checkDataset()
    setLoading(true)
    const { message, jokes, id } = await createJokes(jokesDatasetId)
    if (message) { alert(message); return }
    setRunId(id!)
    setJokes(jokes)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm italic font-semibold">Generating jokes...</p>
      </div>
    )
  }

  if (jokes == undefined || jokes.length == 0 ) {
    return (
    <div className="p-8">
      <p className="text-sm italic font-semibold">No more jokes to rate! Generate more.</p>
      <Button className="mt-4 ml-2 bg-yellow-400 text-black" onClick={handleCreateJokes} >
        Generate Jokes
      </Button>
    </div>
    )
  }

  const increment = () => {
    setCurrentIdx(currentIdx + 1)
    setJokes((prev) => prev!.slice(0, -1))
  }

  const handleVote = async () => {
    increment()
    await handleFeedback(runId, jokes[currentIdx], jokesDatasetId)
  }

  const handleTrash = async () => {
    increment()
    await handleFeedback(runId, jokes[currentIdx], flopsDatasetId)
  }

  const handleSkip = () => {
    increment()
  }

  return (
    <div className="p-6">
      <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
        Joke #{currentIdx}
      </h3>
      <ul>
        <li>{jokes[jokes.length-1]}</li>
        <div className="flex justify-between w-1/2 mt-2">
          {
            flopsDatasetId &&
              <Button onClick={handleTrash}>
                Trash
              </Button>
          }
        <Button variant="outline" onClick={handleSkip}>
          Skip
        </Button>
        <Button onClick={handleVote}>
          Upvote
        </Button>
        </div>
      </ul>
    </div>
  )
}

const initialState = {
  message: ""
}


export function JokeDatasetManager() {
  const [jokesDataset, setJokesDataset] = useState<Dataset | null>(null)
  const [flopsDataset, setFlopsDataset] = useState<Dataset | null>(null)
  
  const datasetName = jokesDataset?.name
  const createExampleWithDatasetName = createExample.bind(null, datasetName)

  const [state, formAction] = useFormState(createExampleWithDatasetName, initialState)

  async function checkDataset() {
    const jokesDatasetStatus = await getDatasetStatus("jokes")
    const flopsDatasetStatus = await getDatasetStatus("flops")
    setJokesDataset(jokesDatasetStatus)
    setFlopsDataset(flopsDatasetStatus)
  }

  useEffect(() => {
    checkDataset()
  }, [])

  return (
    <div className="p-4">
      <div className="grid grid-cols-2">
      <form action={formAction} className="flex flex-col gap-4 p-4 py-12 border dark:bg-black">
        <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Create Joke Form
        </h3>
        <Input type="text" name="joke" placeholder="Joke" />
        <Button className="w-36" type="submit">Create Example</Button>
        <p className="text-sm"><b>Last Result:</b> {state.message}</p>
      </form>
      <JokeRater jokesDatasetId={jokesDataset?.id} flopsDatasetId={flopsDataset?.id} checkDataset={checkDataset} />
      </div>
    </div>
  )
}