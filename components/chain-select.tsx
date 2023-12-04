import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState } from "react"

export function ChainSelect() {
  const [chain, setChain] = useState('dark')
  const [index, setIndex] = useState('light')

  return (
    <div className="flex gap-2">
      <Select value={chain} onValueChange={setChain}>
        <SelectTrigger className="w-fit px-5 dark:bg-lime-600 bg-lime-300 rounded-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent side="top">
          <SelectItem value="QA">QA</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
          <SelectItem value="system">Syawefawefawefawefstem</SelectItem>
        </SelectContent>
        </Select>
      {chain === 'QA' && (
        <Select value={index} onValueChange={setIndex}>
          <SelectTrigger className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">Syawefawefawefawefstem</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}