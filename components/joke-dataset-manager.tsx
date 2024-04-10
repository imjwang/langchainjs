'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useState, useEffect } from 'react'
import {
  createExample,
  getExamples,
  handleFeedback,
  getDataset,
  jokesDatasetToJSONL,
  getJokes,
  testEval,
  runEvaluation
} from '@/app/langsmith-actions'
import { type Dataset } from 'langsmith'
import { useFormState } from 'react-dom'
import { generateJokes } from '@/lib/chains/jokes'
import toast from 'react-hot-toast'

type JokeRaterProps = {
  datasetName: string | undefined
}

function JokeRater({
  datasetName,
}: JokeRaterProps) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [jokes, setJokes] = useState<string[] | undefined>(undefined)
  const [reasons, setReasons] = useState<string[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  const handleCreateJokes = async () => {
    setCurrentIdx(0)
    setLoading(true)
    const response = await generateJokes('5')
    const jokes = response.reduce((acc, val) => acc.concat(val.response.joke), [])
    setJokes(jokes)
    const reasons = response.reduce((acc, val) => acc.concat(val.response.reason), [])
    setReasons(reasons)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm italic font-semibold">Generating jokes...</p>
      </div>
    )
  }

  if (jokes == undefined || jokes.length == 0) {
    return (
      <div className="p-8">
        <p className="text-sm italic font-semibold">
          No more jokes to rate! Generate more.
        </p>
        <Button
          className="mt-4 ml-2 bg-yellow-400 text-black"
          onClick={handleCreateJokes}
        >
          Generate Jokes
        </Button>
      </div>
    )
  }

  const increment = () => {
    setJokes(prev => prev!.slice(1))
    setReasons(prev => prev!.slice(1))
    setCurrentIdx(currentIdx + 1)
  }

  const handleVote = async () => {
    // todo replace with createExample
    const formData = new FormData()
    formData.append("joke", jokes[0])
    formData.append("reason", reasons[0])
    formData.append("rating", "funny")
    const res = await createExample(datasetName, null, formData)
    if (res.message === 'error') toast('Upload to dataset failed.')
    increment()
  }

  const handleReject = async () => {
    // todo replace with createExample
    const formData = new FormData()
    formData.append("joke", jokes[0])
    formData.append("reason", reasons[0])
    formData.append("rating", "flop")
    const res = await createExample(datasetName, null, formData)
    if (res.message === 'error') toast('Upload to dataset failed.')
    increment()
  }

  const handleSkip = () => {
    increment()
  }

  return (
    <div className="p-6">
      <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
        Joke #{currentIdx + 1}
      </h3>
      <ul>
        <li>{jokes[0]}</li>
        <div className="flex justify-between w-1/2 mt-2">
          <Button variant="outline" onClick={handleSkip}>
            Skip
          </Button>
          <Button onClick={handleVote}>Upvote</Button>
          <Button onClick={handleReject}>Downvote</Button>
        </div>
      </ul>
    </div>
  )
}

const initialState = {
  message: ''
}

export function JokeDatasetManager({ dataset }: { dataset: Dataset | null }) {

  const datasetName = dataset?.name
  const createExampleWithDatasetName = createExample.bind(null, datasetName)

  const [state, formAction] = useFormState(
    createExampleWithDatasetName,
    initialState
  )

  const handleDownload = async () => {
    const jsonlString = await jokesDatasetToJSONL(dataset?.id)
    if (!jsonlString) {
      toast('failed')
      return
    }

    const jsonlBlob = new Blob([jsonlString], {
      type: 'application/jsonl'
    })

    const url = URL.createObjectURL(jsonlBlob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'jokes-finetune.jsonl'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleEval = async () => {
    await runEvaluation(datasetName)
  }


  return (
    <div className="p-4">
      <div className="grid grid-cols-2">
        <form
          action={formAction}
          className="flex flex-col gap-4 p-4 py-12 border dark:bg-black"
        >
          <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Create Joke Form
          </h3>
          <Input type="text" name="joke" placeholder="Joke" />
          <div>
            <div className='flex justify-between'>
              <div>
                <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">
                  Reasoning
                </h4>
                <p className="leading-7">
                  Enter reasoning for why the joke is funny.
                </p>
              </div>
              {/* <Button className="bg-yellow-400 self-end">Generate</Button> */}
            </div>
            <Textarea name="reason" className="mt-1.5" placeholder="..." />
          </div>
          <Input type='text' name="rating" readOnly value="funny" className="hidden" />
          <Input type='datasetName' name={datasetName} readOnly value="funny" className="hidden" />
          <Separator />
          <Button className="w-36" type="submit">
            Create Example
          </Button>
          <p className="text-sm">
            <b>Last Result:</b> {state.message}
          </p>
        </form>
        <div>
          <Button className="ml-2" onClick={handleEval}>
            Run evaluation
          </Button>
          <Button className="ml-2" onClick={handleDownload}>
            Download finetune dataset
          </Button>
        </div>
        <JokeRater
          datasetName={datasetName}
        />
      </div>
    </div>
  )
}
