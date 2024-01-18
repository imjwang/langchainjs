import { Client, type Dataset } from "langsmith";
import { JokeDatasetManager } from "@/components/joke-dataset-manager";


type DatasetProps = {
  dataset: Dataset | null
}

async function Dataset({ dataset=null }: DatasetProps) {
  if (!dataset) {
    return null
  }
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
  const client = new Client()
  const datasetsGenerator = client.listDatasets({datasetNameContains: "jokes"})
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

export default function JokesPage() {

  return (
    <>
      <DatasetVisualizer />
      {/* <JokeDatasetManager /> */}
    </>
  )
}