import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from "@/components/ui/input"
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useState } from "react"
import { Label } from "@/components/ui/label"


export interface ChainSelectProps {
  chain: string
  setChain: (chain: string) => void
  index: string
  setIndex: (index: string) => void
}

export function ChainSelect({chain, setChain, index, setIndex}: any) {
  const path = usePathname()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [indexName, setIndexName] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData();
    formData.append("index", indexName)
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    await fetch('/api/vectorstore', {
      method: 'POST',
      body: formData
    })
  }


  return (
    <div className="flex gap-2">
      <Select value={chain} onValueChange={setChain}>
        <SelectTrigger className="w-fit px-5 dark:bg-lime-600 bg-lime-300 rounded-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top">
          <SelectItem value="/api/retrieval">Semantic Search</SelectItem>
          <SelectItem value="/api/retrieval/chat">Retrieval Augmented Chat</SelectItem>
          <SelectItem value="/api/chat">Chat</SelectItem>
        </SelectContent>
        </Select>
      {chain.includes('/api/retrieval') && (
        <>
        <Select value={index} onValueChange={setIndex}>
          <SelectTrigger className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
          <SelectItem value="Huberman Dataset">Huberman Dataset</SelectItem>
          {/* <SelectItem value="Chat">Chat</SelectItem> */}
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger>
        <Button variant="outline" size="icon" className="h-7" >+</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new Index</DialogTitle>
            <DialogDescription>
              Upload your documents, .txt, .pdf, or .docx
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
          <Label>Name</Label>
          <Input type="text" value={indexName} onChange={(e) => setIndexName(e.target.value)} />
          <Input type="file" accept=".txt" className="mt-2" multiple onChange={(e) => {
              if (e.target.files) {
                setFiles(Array.from(e.target.files));
              }
            }} />
          <Button className="mt-3" type="submit" onClick={() => setDialogOpen(false)}>Send to server</Button>
          </form>
          <DialogFooter className="items-center">
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  )
}