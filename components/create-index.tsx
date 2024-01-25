'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

export interface CreateIndexProps {
  message?: string
  variant?: 'icon' | 'default' | 'sm' | 'lg' | null | undefined
}

export function CreateIndex({
  message = '+',
  variant = 'icon'
}: CreateIndexProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [indexName, setIndexName] = useState('')
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const res = await fetch('api/retrieval/collection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tableName: indexName
      })
    })
    const { message } = await res.json()
    if (message !== 'success') {
      alert(message)
      return
    }

    const formData = new FormData()
    formData.append('index', indexName)
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }
    await fetch('/api/vectorstore', {
      method: 'POST',
      body: formData
    })
  }
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger>
        <Button variant="outline" size={variant} className="h-7">
          {message}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new Index</DialogTitle>
          <DialogDescription>
            Upload your documents, .txt, .pdf, or .csv
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Label>Name</Label>
          <div className="flex flex-col gap-2">
            <Input
              type="text"
              value={indexName}
              onChange={e => setIndexName(e.target.value)}
            />
            <Input
              type="file"
              accept="text/plain, application/pdf, text/csv"
              multiple
              onChange={e => {
                if (e.target.files) {
                  setFiles(Array.from(e.target.files))
                }
              }}
            />
            <Button
              className="w-32 place-self-end"
              type="submit"
              onClick={() => setDialogOpen(false)}
            >
              Send
            </Button>
          </div>
        </form>
        <DialogFooter className="items-center"></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
