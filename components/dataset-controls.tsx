'use client'

import {
  getDataset,
  createDataset,
  deleteDataset
} from '@/app/langsmith-actions'
import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import type { Dataset } from 'langsmith'

type DatasetControlsProps = {
  datasetName: string | undefined
  initialDataset: Dataset | null
}

export function DatasetControls({
  datasetName,
  initialDataset
}: DatasetControlsProps) {

  const handleCreate = async () => {
    await createDataset("jokes")
  }

  const handleDelete = async () => {
    await deleteDataset("jokes")
  }

  return (
    <>
      {initialDataset ? (
        <Button variant="destructive" onClick={handleDelete}>
          Delete Dataset
        </Button>
      ) : (
        <Button onClick={handleCreate}>
          Create Dataset
        </Button>
      )}
    </>
  )
}
