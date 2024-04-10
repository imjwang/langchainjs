import { getDataset } from '@/app/langsmith-actions'
import { Client, type Dataset } from 'langsmith'
import { DatasetControls } from './dataset-controls'

type DatasetProps = {
  dataset: Dataset | null
}

function Dataset({ dataset = null }: DatasetProps) {
  if (!dataset) {
    return null
  }
  return (
    <div className="p-4 w-1/2">
      <div className="bg-black p-2 text-white rounded-t-md drop-shadow-md">
        <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
          {dataset.name}
        </h3>
      </div>
      <div className="bg-slate-200 dark:bg-slate-600 py-6 rounded-b-md drop-shadow-md border border-black">
        <ul className="ml-8 list-disc">
          <li>
            <b>Description:</b> {dataset.description}
          </li>
          <li>
            <b>Size:</b> {dataset.example_count}
          </li>
        </ul>
      </div>
    </div>
  )
}

type DatasetVisualizerProps = {
  dataset: Dataset | null
}

export async function DatasetVisualizer({
  dataset
}: DatasetVisualizerProps) {
  return (
    <>
      <Dataset dataset={dataset} key={dataset?.id} />
      <DatasetControls initialDataset={dataset} datasetName={dataset?.name} />
    </>
  )
}
