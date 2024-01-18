'use client'

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { createJokeDataset, deleteJokeDataset, getJokeDatasetStatus, createExample } from "@/app/langsmith-actions";
import { type Dataset } from "langsmith";
import { useFormState } from 'react-dom'


const initialState = {
  message: ""
}

export function JokeDatasetManager() {
  const [jokeDataset, setJokeDataset] = useState<Dataset | undefined>(undefined)
  const datasetName = jokeDataset?.name
  const createExampleWithDatasetName = createExample.bind(null, datasetName)

  const [state, formAction] = useFormState(createExampleWithDatasetName, initialState)

  async function checkDataset() {
    const exists = await getJokeDatasetStatus()
    setJokeDataset(exists)
  }

  const handleCreate = async () => {
    await createJokeDataset()
    checkDataset()
  }

  const handleDelete = async () => {
    await deleteJokeDataset()
    checkDataset()
  }

  useEffect(() => {
    checkDataset()
  }, [])

  return (
    <div className="p-4">
      {
        jokeDataset ?
        <Button onClick={handleDelete}>Delete Dataset</Button>
        :
        <Button onClick={handleCreate}>Create Dataset</Button>
      }
      <form action={formAction} className="flex flex-col gap-4 p-4 py-12 mt-6 w-1/3 border dark:bg-black">
        <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Create Joke Form
        </h3>
        <Input type="text" name="joke" placeholder="Joke" />
        <Button className="w-36" type="submit">Create Example</Button>
        <p className="text-sm"><b>Last Result:</b> {state.message}</p>
      </form>
    </div>
  )
}