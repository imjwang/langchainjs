'use client'

import {
  getDatasetStatus,
  createDataset,
  deleteDataset
} from '@/app/langsmith-actions'
import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import type { Dataset } from 'langsmith'

type DatasetControlsProps = {
  datasetName: string
  initialDataset: Dataset | null
}

export function DatasetControls({
  datasetName,
  initialDataset
}: DatasetControlsProps) {
  const [dataset, setDataset] = useState<Dataset | null>(initialDataset)

  async function checkDataset() {
    const status = await getDatasetStatus(datasetName)
    setDataset(status)
  }

  useEffect(() => {
    checkDataset()
  }, [])

  const handleCreate = async () => {
    await createDataset(datasetName)
    checkDataset()
  }

  const handleDelete = async () => {
    await deleteDataset(datasetName)
    checkDataset()
  }

  return (
    <>
      {dataset ? (
        <Button variant="destructive" onClick={handleDelete}>
          Delete &quot;{datasetName}&quot; Dataset
        </Button>
      ) : (
        <Button onClick={handleCreate}>
          Create &quot;{datasetName}&quot; Dataset
        </Button>
      )}
    </>
  )
}
