'use server'

import { Client } from 'langsmith'
import { type Dataset, Run, Example } from 'langsmith'
import { nanoid } from 'ai'
import { revalidatePath } from 'next/cache'
import { StringEvaluator, EvaluationResult } from 'langsmith/evaluation'
import { push } from 'langchain/hub'
import {
  PromptTemplate,
  ChatPromptTemplate,
  FewShotPromptTemplate,
  PipelinePromptTemplate
} from '@langchain/core/prompts'
import { VoyageEmbeddings } from 'langchain/embeddings/voyage'
import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { RunnableSequence } from '@langchain/core/runnables'
import { formatDocumentsAsString } from 'langchain/util/document'
import { SemanticSimilarityExampleSelector } from '@langchain/core/example_selectors'
import {
  StringOutputParser,
  JsonOutputParser
} from '@langchain/core/output_parsers'
import { ChatOpenAI } from '@langchain/openai'
import {
  EvaluatorInputFormatter,
  RunEvalConfig,
  runOnDataset
} from 'langchain/smith'

const client = new Client()

const model = new ChatOpenAI({
  modelName: 'gpt-4-turbo-preview',
  temperature: 0,
  verbose: true
})

const randomModel = new ChatOpenAI({
  modelName: 'gpt-4-turbo-preview',
  temperature: 1,
  verbose: true
})

const gpt3 = new ChatOpenAI({
  modelName: 'gpt-3.5-turbo-0125',
  temperature: 1,
  verbose: true
})

const finetunedModel = new ChatOpenAI({
  modelName: 'ft:gpt-3.5-turbo-0125:jwai:jokes:96iQGgGX',
  temperature: 1
})

const baseChain = RunnableSequence.from([
  PromptTemplate.fromTemplate(`{question}`),
  randomModel,
  new StringOutputParser()
])

const gpt3Chain = RunnableSequence.from([
  PromptTemplate.fromTemplate(`{question}`),
  gpt3,
  new StringOutputParser()
])

const finetunedChain = RunnableSequence.from([
  PromptTemplate.fromTemplate(`{question}`),
  finetunedModel,
  new StringOutputParser()
])

export async function createDataset(datasetName: string | undefined) {
  const name = `${datasetName}-${nanoid(10)}`
  // TODO implement here
  const dataset = await client.createDataset(name, {
    description: `${datasetName} dataset from langchainjs bootcamp.`
  })
  revalidatePath('/')
  return dataset
}

export async function createExample(
  datasetName: any,
  prevState: any,
  formData: FormData
) {
  if (!datasetName) {
    return {
      message: 'No dataset found'
    }
  }
  const question = 'Tell me a joke.'
  const joke = formData.get('joke') as string
  const reason = formData.get('reason') as string
  const rating = formData.get('rating') as string
  try {
    /// TODO implement here
    await client.createExample(
      { question },
      { joke, reason, rating },
      { datasetName }
    )
  } catch (error) {
    console.log(error)
    return {
      message: 'error'
    }
  }
  revalidatePath('/')
  return {
    message: `Success: ${joke.substring(0, 10)}... created.`
  }
}

export async function getDataset(datasetName: string | undefined) {
  if (!datasetName) {
    return null
  }
  revalidatePath('/')
  const datasetsGenerator = client.listDatasets({
    datasetNameContains: datasetName
  })
  for await (const dataset of datasetsGenerator) {
    return dataset
  }
  return null
}

export async function deleteDataset(datasetName: string | undefined) {
  revalidatePath('/')
  try {
    const dataset = await getDataset(datasetName)
    await client.deleteDataset({ datasetId: dataset.id })
  } catch (error) {
    return {
      message: 'error'
    }
  }
  revalidatePath('/')
  return 'ok'
}

export async function getExamples(
  datasetId: string | undefined
): Promise<string[]> {
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

export async function createExamplesFromArray(
  jokes: string[],
  datasetId: string | undefined
) {
  if (!datasetId) {
    return {
      message: 'No dataset found'
    }
  }

  for (const joke of jokes) {
    await client.createExample(
      { question: 'Tell me a joke.' },
      { joke },
      { datasetId }
    )
  }

  revalidatePath('/')
  return {
    message: `${jokes.length} jokes created.`
  }
}

export async function getJokes(datasetName: string | undefined) {
  const dataset = await client.listExamples({ datasetName })
  const flops = []
  const funnyJokes = []
  for await (const example of dataset) {
    if (example?.outputs?.rating === 'funny') {
      funnyJokes.push(example)
    } else {
      flops.push(example)
    }
  }
  return {
    flops,
    funnyJokes
  }
}

export type Eval = {
  flop: boolean
}

export async function initEvalChain(datasetName: string | undefined) {
  const { flops } = await getJokes(datasetName)
  const formattedFlops = flops.map(example => {
    return {
      flop: example.outputs?.joke,
      flopReason: example.outputs?.reason
    }
  })
  const flopSelector = await SemanticSimilarityExampleSelector.fromExamples(
    formattedFlops,
    new VoyageEmbeddings({ modelName: 'voyage-2' }), // 1536 embedding dimension
    MemoryVectorStore,
    { k: 10 }
  )
  const flopExamplePrompt = PromptTemplate.fromTemplate(
    `\t- Flop: {flop} Reason: {flopReason}`
  )
  const dynamicFlopPrompt = new FewShotPromptTemplate({
    prefix: `The following are a collection of previous "flops":`,
    exampleSelector: flopSelector,
    examplePrompt: flopExamplePrompt,
    inputVariables: ['evalJoke']
  })

  const finalPrompt = PromptTemplate.fromTemplate(
    `Please help the user determine if a joke will "flop". A "flop" is a joke that did not resonate with the audience. {flopExamples}\
{task}`
  )
  const taskPrompt =
    PromptTemplate.fromTemplate(`Using the provided data, use your best judgement to predict if the next joke will flop.

Joke: {evalJoke}

Output your response as a JSON with a single boolean field of "flop".
`)
  const prompt = new PipelinePromptTemplate({
    finalPrompt,
    pipelinePrompts: [
      {
        name: 'flopExamples',
        prompt: dynamicFlopPrompt
      },
      {
        name: 'task',
        prompt: taskPrompt
      }
    ]
  })

  const evalChain = RunnableSequence.from([
    prompt,
    model,
    new JsonOutputParser()
  ])

  return evalChain
}

export async function runEvaluation(
  datasetName: string | undefined,
  evalDataset = 'altered-eval-dataset'
) {
  const evalChain = await initEvalChain(datasetName)
  const flopEvaluator = async ({
    run,
    example
  }: {
    run: Run
    example?: Example
  }): Promise<EvaluationResult> => {
    const score = (await evalChain.invoke({
      evalJoke: run.outputs?.output
    })) as Eval
    return {
      key: 'flop',
      score: score.flop ? 100 : 0
    }
  }

  const formatEvaluatorInputs: EvaluatorInputFormatter = function ({
    rawInput,
    rawPrediction
  }) {
    return {
      question: rawInput.question,
      prediction: rawPrediction?.output
    }
  }
  await runOnDataset(baseChain, evalDataset, {
    evaluators: [flopEvaluator],
    formatEvaluatorInputs
  })
  await runOnDataset(gpt3Chain, evalDataset, {
    evaluators: [flopEvaluator],
    formatEvaluatorInputs
  })
  await runOnDataset(finetunedChain, evalDataset, {
    evaluators: [flopEvaluator],
    formatEvaluatorInputs
  })
}

export async function testEval(datasetName: string | undefined) {
  const { funnyJokes, flops } = await getJokes(datasetName)
  // reserve some flops for evaluation
  const evalFlops = flops
    .slice(0, 10)
    .map(example => ({ evalJoke: example.outputs?.joke }))
  // also keep some funny jokes for evaluation
  const evalJokes = funnyJokes
    .slice(0, 10)
    .map(example => ({ evalJoke: example.outputs?.joke }))

  const subsetFlops = flops.slice(10)
  const formattedFlops = subsetFlops.map(example => {
    return {
      flop: example.outputs?.joke,
      flopReason: example.outputs?.reason
    }
  })
  const flopSelector = await SemanticSimilarityExampleSelector.fromExamples(
    formattedFlops,
    new VoyageEmbeddings({ modelName: 'voyage-2' }), // 1536 embedding dimension
    MemoryVectorStore,
    { k: 10 }
  )
  const flopExamplePrompt = PromptTemplate.fromTemplate(
    `\t- Flop: {flop} Reason: {flopReason}`
  )
  const dynamicFlopPrompt = new FewShotPromptTemplate({
    prefix: `The following are a collection of previous "flops":`,
    exampleSelector: flopSelector,
    examplePrompt: flopExamplePrompt,
    inputVariables: ['evalJoke']
  })

  const finalPrompt = PromptTemplate.fromTemplate(
    `Please help the user determine if a joke will "flop". A "flop" is a joke that did not resonate with the audience. {flopExamples}\
{task}`
  )
  const taskPrompt =
    PromptTemplate.fromTemplate(`Using the provided data, use your best judgement to predict if the next joke will flop.

Joke: {evalJoke}

Output your response as a JSON with a single boolean field of "flop".
`)
  const prompt = new PipelinePromptTemplate({
    finalPrompt,
    pipelinePrompts: [
      {
        name: 'flopExamples',
        prompt: dynamicFlopPrompt
      },
      {
        name: 'task',
        prompt: taskPrompt
      }
    ]
  })

  const evalChain = RunnableSequence.from([
    prompt,
    model,
    new JsonOutputParser()
  ])
  type Eval = {
    flop: boolean
  }
  const flopEval = (await evalChain.batch(evalFlops)) as Eval[]
  const flopCount = flopEval.filter(res => res.flop === true).length
  const jokeEval = (await evalChain.batch(evalJokes)) as Eval[]
  const jokeCount = jokeEval.filter(res => res.flop === false).length
  console.log(`Evaluation Results: ${flopCount + jokeCount} / 20
Funny: ${jokeCount} / 10
Flops: ${flopCount} / 10
`)
}

export async function handleFeedback(
  runId: string,
  joke: string,
  datasetId: string | undefined,
  key: string
) {
  try {
    await client.createFeedback(runId, key, { comment: joke })
    if (datasetId) {
      await createExamplesFromArray([joke], datasetId)
    }
  } catch (e) {
    return {
      message: 'error'
    }
  }

  revalidatePath('/')
  return {
    message: 'success'
  }
}

export async function jokesDatasetToJSONL(datasetId: string | undefined) {
  if (!datasetId) return null
  revalidatePath('/')

  const formattedEntries = []
  const dataset = client.listExamples({ datasetId })

  for await (const entry of dataset) {
    const { inputs, outputs } = entry
    // format for gpt finetuning https://platform.openai.com/docs/guides/fine-tuning/preparing-your-dataset
    if (outputs?.rating === 'flop') continue
    const messageObject = {
      messages: [
        {
          role: 'user',
          content: inputs.question
        },

        {
          role: 'assistant',
          content: outputs?.joke
        }
      ]
    }
    formattedEntries.push(messageObject)
  }
  // @ts-ignore
  const jsonl = formattedEntries.map(JSON.stringify).join('\n')
  return jsonl
}
