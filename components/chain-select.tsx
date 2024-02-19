import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CreateIndex } from '@/components/create-index'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from './ui/label'

export interface ChainSelectProps {
  chain: string
  setChain: (chain: string) => void
  index: string
  setIndex: (index: string) => void
  push: boolean,
  setPush: Function
}

export function ChainSelect({ chain, setChain, index, setIndex, push, setPush }: any) {
  return (
    <div className="flex gap-2">
      <Select value={chain} onValueChange={setChain}>
        <SelectTrigger className="w-fit px-5 dark:bg-lime-600 bg-lime-300 rounded-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top">
          <SelectItem value="/api/retrieval/chat">
            Retrieval Augmented Chat
          </SelectItem>
          <SelectItem value="/api/agent/example">Agent Example</SelectItem>
          <SelectItem value="/api/agent">Agent</SelectItem>
          <SelectItem value="/api/chat">Chat</SelectItem>
          <SelectItem value="/api/prompt">Prompt</SelectItem>
          <SelectItem value="/api/dynamic">Final</SelectItem>
          <SelectItem value="/api/jokes">Jokes</SelectItem>
          <SelectItem value="/api/retrieval/health">Huberman</SelectItem>
        </SelectContent>
      </Select>
      {!chain.includes('/api/chat') && (
        <>
          <Select value={index} onValueChange={setIndex}>
            <SelectTrigger className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectItem value="demo">Huberman Dataset</SelectItem>
              {/* <SelectItem value="Chat">Chat</SelectItem> */}
            </SelectContent>
          </Select>
          <CreateIndex />
        </>
      )}
      <div className="flex place-items-center gap-2">
        <Checkbox className="size-5 stroke-black stroke-[20px]" value={push} onClick={() => setPush(!push)} />
        <Label>push</Label>
      </div>
    </div>
  )
}
