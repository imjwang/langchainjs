import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CreateIndex } from "@/components/create-index"

export interface ChainSelectProps {
  chain: string
  setChain: (chain: string) => void
  index: string
  setIndex: (index: string) => void
}

export function ChainSelect({chain, setChain, index, setIndex}: any) {

  return (
    <div className="flex gap-2">
      <Select value={chain} onValueChange={setChain}>
        <SelectTrigger className="w-fit px-5 dark:bg-lime-600 bg-lime-300 rounded-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top">
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
        <CreateIndex />
        </>
      )}
    </div>
  )
}