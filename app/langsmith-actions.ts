'use server'

import { Client } from "langsmith";
import { type Dataset } from "langsmith";
import { nanoid } from "ai";
import { revalidatePath } from "next/cache";

const client = new Client()

export async function createDataset(datasetName: string) {
  const name = `${datasetName}-${nanoid(10)}`
  const dataset = await client.createDataset(name, {
    description: `${datasetName} dataset from langchainjs bootcamp.`
  })

  revalidatePath('/')
  return dataset
}

export async function createExample(datasetName: string | undefined, prevState: any, formData: FormData) {
  if (!datasetName) {
    return {
      message: "No dataset found"
    }
  }

  const question = "Tell me a joke."
  const joke = formData.get('joke') as string

  try {
    await client.createExample(
      { question },
      { joke },
      { datasetName }
    )
  } catch (error) {
    return {
      message: "error"
    }
  }

  if (joke === null) {
    return {
      message: "No joke found"
    }
  }

  revalidatePath('/')
  return {
    message: `Success: ${joke.substring(0, 10)}... created.`
  }
}

export async function deleteDataset(datasetName: string) {
  revalidatePath('/')

  const datasetsGenerator = client.listDatasets({ datasetNameContains: datasetName })

  for await (const dataset of datasetsGenerator) {
    await client.deleteDataset({datasetName: dataset.name})
  }

  revalidatePath('/')
  return "ok"
}

export async function getDatasetStatus(datasetName: string) {
  revalidatePath('/')

  const datasetsGenerator = client.listDatasets({ datasetNameContains: datasetName })
  
  for await (const dataset of datasetsGenerator) {
    return dataset
  }

  return null
}


export async function getExamples(datasetId: string | undefined) {
  if (!datasetId) {
    return []
  }

  revalidatePath('/')

  const examplesGenerator = client.listExamples({ datasetId })

  const examples = []
  for await (const { outputs } of examplesGenerator) {
    examples.push(outputs?.joke)
  }

  return examples
}


export async function createExamplesFromArray(jokes: string[], datasetId: string | undefined) {
  if (!datasetId) {
    return {
      message: "No dataset found"
    }
  }

  for (const joke of jokes) {
    await client.createExample(
      { question: "Tell me a joke." },
      { joke },
      { datasetId }
    )
  }

  revalidatePath('/')
  return {
    message: `${jokes.length} jokes created.`
  }
}


export async function handleFeedback(runId: string, joke: string, datasetId: string | undefined) {
  await client.createFeedback(runId, "lol", { comment: joke })
  if (datasetId) {
    await createExamplesFromArray([joke], datasetId)
    revalidatePath('/')
  }
}