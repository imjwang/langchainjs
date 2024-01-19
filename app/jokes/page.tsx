import { JokeDatasetManager } from "@/components/joke-dataset-manager";
import { DatasetVisualizer } from "@/components/dataset-viz";

export default function JokesPage() {

  return (
    <>
      <DatasetVisualizer />
      <JokeDatasetManager />
    </>
  )
}