'use server'

import { Client } from "langsmith";
import { type Dataset } from "langsmith";
import { nanoid } from "ai";
import { revalidatePath } from "next/cache";
import { create } from "domain";

const client = new Client()

export async function createJokeDataset() {
  const datasetName = `jokes-${nanoid(10)}`
  const dataset = await client.createDataset(datasetName, {
    description: "Jokes dataset from langchainjs bootcamp."
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
  const joke = formData.get('joke')

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

  revalidatePath('/')
  return {
    message: "Success"
  }
}

export async function deleteJokeDataset() {
  revalidatePath('/')

  const datasetsGenerator = client.listDatasets({ datasetNameContains: "jokes" })

  for await (const dataset of datasetsGenerator) {
    await client.deleteDataset({datasetName: dataset.name})
  }

  revalidatePath('/')
  return "ok"
}

export async function getJokeDatasetStatus() {
  revalidatePath('/')

  const datasetsGenerator = client.listDatasets({ datasetNameContains: "jokes" })
  
  for await (const dataset of datasetsGenerator) {
    return dataset
  }

  return undefined
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
    return "No dataset found"
  }

  for (const joke of jokes) {
    await client.createExample(
      { question: "Tell me a joke." },
      { joke },
      { datasetId }
    )
  }

  revalidatePath('/')
  return "ok"
}
