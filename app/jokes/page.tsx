import { JokeDatasetManager } from '@/components/joke-dataset-manager'
import { DatasetVisualizer } from '@/components/dataset-viz'

export default function JokesPage() {
  return (
    <>
      <JokeDatasetManager />
      <div className="flex flex-col gap-2 p-4">
        <DatasetVisualizer datasetName="jokes" />
        <DatasetVisualizer datasetName="flops" />
      </div>
    </>
  )
}
