'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Button } from '@/components/ui/button'
import { useState, useEffect } from "react"
import { CreateIndex } from "@/components/create-index"

export default function RetrievalPage() {
  const [number, setNumber] = useState('')
  const [index, setIndex] = useState('')
  const [indexOptions, setIndexOptions] = useState([])
  const [results, setResults] = useState([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    const getIndexOptions = async () => {
      const res = await fetch('api/retrieval/collection')
      const { data } = await res.json()
      setIndexOptions(data)
    }
    getIndexOptions()
  }, [])

  const handleClick = async () => {
    const res = await fetch('api/retrieval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          index,
          number,
          query
          })
        })
        const {documents} = await res.json()
        setResults(documents)
  }


  return (
    <div className="p-6 w-screen flex flex-col gap-2">
      <div className="flex justify-between">
    <div className="flex gap-4">
      <p>Index:</p>
      <Select value={index} onValueChange={setIndex}>
        <SelectTrigger className="w-fit dark:bg-black font-normal">
          <SelectValue placeholder="click to select" />
        </SelectTrigger>
        <SelectContent>
        <SelectItem value="demo">
          Huberman Podcast
            </SelectItem>
          {indexOptions.map(({collection_name}: any) => (
            <SelectItem key={collection_name} value={collection_name}>
              {collection_name}
            </SelectItem>
          ))}
        </SelectContent>
        </Select>
        <p># of Docs:</p>
        <Select value={number} onValueChange={setNumber}>
        <SelectTrigger className="w-10 dark:bg-black font-normal">
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 10 }).map((_, i) => (
            <SelectItem key={i} value={`${i+1}`}>
              {i+1}
            </SelectItem>
          ))}
        </SelectContent>
        </Select>
        <Button onClick={handleClick}>
            Search
        </Button>
    </div>
    <CreateIndex message="Create Index" variant="default" />
      </div>
    <Textarea onBlur={(e) => setQuery(e.target.value)} defaultValue={query} />
    <div className="py-4 flex flex-col gap-4">
        {results.map(([{pageContent}, score], id: any) => (
          <div key={id} className="w-full p-4 bg-black">
            <div className="text-green-500 font-bold">
              Score: {score}
            </div>
            <div className="w-full h-full text-white p-4">
              {pageContent}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}