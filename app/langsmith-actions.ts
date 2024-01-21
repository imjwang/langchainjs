'use server'

import { Client } from "langsmith";
import { type Dataset } from "langsmith";
import { nanoid } from "ai";
import { revalidatePath } from "next/cache";
import { StringEvaluator } from "langsmith/evaluation"


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


export async function getExamples(datasetId: string | undefined): Promise<string[]> {
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


export async function handleFeedback(runId: string, joke: string, datasetId: string | undefined, key: string) {
  try {
    await client.createFeedback(runId, key, { comment: joke })
    if (datasetId) {
      await createExamplesFromArray([joke], datasetId)
    }
  } catch (e) {
    return {
      message: "error"
    }
  }

  revalidatePath('/')
  return {
    message: "success"
  }
}


export async function jokesDatasetToJSONL(datasetId: string | undefined) {
  if (!datasetId) return null
  revalidatePath('/')

  const formattedEntries = []
  const dataset = client.listExamples({ datasetId })

  for await (const entry of dataset) {
    // format for aws bedrock finetuning https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-prepare.html#model-customization-prepare-finetuning
    const {inputs: { question: prompt }, outputs } = entry
    formattedEntries.push({prompt, completion: outputs?.joke })
  }
  // @ts-ignore
  const jsonl = formattedEntries.map(JSON.stringify).join('\n');

  return jsonl
}
