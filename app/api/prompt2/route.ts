import { StreamingTextResponse } from 'ai';
 
// import { RemoteRunnable } from "langchain/runnables/remote"
import { BytesOutputParser } from 'langchain/schema/output_parser';
import { pull, push } from "langchain/hub";
import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, AIMessagePromptTemplate, MessagesPlaceholder } from "langchain/prompts";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { createSupabaseClient } from '@/lib/serverUtils';

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const {data, error} = await supabase.auth.getSession()
  
  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

const systemTemplate = 'You are a helpful and good intentioned {character}.'
const humanTemplate = '{question}'
const aiTemplate = '{aiPrompt}'

const systemMessagePrompt = SystemMessagePromptTemplate.fromTemplate(systemTemplate)
const humanMessagePrompt = HumanMessagePromptTemplate.fromTemplate(humanTemplate)
const aiMessagePrompt = AIMessagePromptTemplate.fromTemplate(aiTemplate)

const chatPrompt = ChatPromptTemplate.fromMessages([systemMessagePrompt, humanMessagePrompt, aiMessagePrompt])

const character = 'Santa'
const question = 'How is the weather in Antartica?'
const zeroShotPrompt = 'Let\'s think step by step.'

const prompt = await chatPrompt.formatMessages({
  character,
  question,
  aiPrompt : zeroShotPrompt,
})

console.log(prompt)

  

  const moods = ["happy", "sad", "melodramatic", "crazy"]

  const getRandomMood = (moods: Array<string>) => {
    return moods[Math.floor(Math.random() * moods.length)];
  }
  
  
  const { messages } = await req.json()
  const currentMessage = messages[messages.length - 1].content;
  
  const mood = getRandomMood(moods)
  
  const activity = "talking to squidward"

  const templateString = `You are Spongebob Squarepants.
  SpongeBob SquarePants is an energetic and optimistic yellow sea sponge who lives in a submerged pineapple.\
   SpongeBob has a childlike enthusiasm for life, which carries over to his job as a fry cook at a fast food \
   restaurant called the Krusty Krab. One of his life's greatest goals is to obtain a boat-driving license \
   from Mrs. Puff's Boating School, but he never succeeds. His favorite pastimes include "jellyfishing", which \
   involves catching jellyfish with a net in a manner similar to butterfly catching, and blowing soap bubbles into\
    elaborate shapes. He has a pet sea snail with a pink shell and a blue body named Gary, who meows like a cat.

    You are having a ${mood} day and just got done with ${activity}. Please keep the conversation short.

    ${currentMessage}
  `

  const model = new ChatOpenAI({
    modelName: "gpt-4-1106-preview",
  });

  const outputParser = new BytesOutputParser();

  // LangChain Expression Language (LCEL) Pipe Chain
  const chain = model.pipe(outputParser);

  const stream = await chain.stream(templateString)

  return new StreamingTextResponse(stream)
}
