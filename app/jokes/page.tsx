import { Client } from "langsmith";
import { type Dataset } from "langsmith";
import { Button } from "@/components/ui/button";
import { JokeDatasetManager } from "@/components/joke-dataset-manager";

const client = new Client()

type DatasetProps = {
  dataset: Dataset
}

async function Dataset({dataset}: DatasetProps) {
  return (
    <div className="p-4 w-1/2">
      <div className="bg-black p-2 text-white rounded-t-md">
      <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
      {dataset.name}      
      </h3>
      </div>
      <div className="bg-slate-200 dark:bg-slate-600 py-6 rounded-b-md">
      <ul className="ml-8 list-disc">
        <li><b>Description:</b> {dataset.description}</li>
        <li><b>Size:</b> {dataset.example_count}</li>
      </ul>
      </div>
  </div>
  )
}

async function DatasetVisualizer() {
  const datasetsGenerator = await client.listDatasets({datasetNameContains: "jokes"})
  const datasets = []
  
  for await (const dataset of datasetsGenerator) {
    datasets.push(dataset)
  }

  return (
    <>
    {
      datasets.map((dataset) => {
        return (
          <Dataset dataset={dataset} key={dataset.id} />
        )
      }
      )
    }
    </>
  )
}

// async function JokeDatasetManager() {
//   const datasetName = "jokes"
//   const datasetsGenerator = await client.listDatasets({datasetName})

//   const datasets = []
  
//   for await (const dataset of datasetsGenerator) {
//     datasets.push(dataset)
//   }

//   const exists = datasets.length > 0

//   return (
//     <>
//       {
//         exists ? <h1>hi</h1> : <h1>Create Dataset</h1>
//       }
//     </>
//   )
// }

export default function DatasetPage() {

  return (
    <>
      <DatasetVisualizer />
      <JokeDatasetManager />
    </>
  )
}