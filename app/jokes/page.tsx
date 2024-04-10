import { JokeDatasetManager } from '@/components/joke-dataset-manager'
import { DatasetVisualizer } from '@/components/dataset-viz'
import { getDataset } from '../langsmith-actions'

export default async function JokesPage() {
  const dataset = await getDataset('jokes')
  return (
    <>
      <JokeDatasetManager dataset={dataset} />
      <div className="flex flex-col gap-2 p-4">
        <DatasetVisualizer dataset={dataset} />
      </div>
    </>
  )
}
