import { Client } from "langsmith"
import { NextResponse } from "next/server"


const client = new Client()

export async function GET() {
  const datasetsGenerator = await client.listDatasets({ datasetNameContains: "jokes" })

  const datasets = []
  
  for await (const dataset of datasetsGenerator) {
    datasets.push(dataset)
  }

  console.log(datasets)

  return NextResponse.json({datasets})
}