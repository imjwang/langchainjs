import { StreamingTextResponse, Message } from 'ai';
 
import { RemoteRunnable } from "langchain/runnables/remote"
import { BytesOutputParser } from 'langchain/schema/output_parser';
import { pull } from "langchain/hub";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "langchain/prompts";
import { createSupabaseClient } from '@/lib/serverUtils';
import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";

export const runtime = 'edge'


const formatMessage = (message: Message) => {
    if (message.role === 'system') {
      return new SystemMessage(message.content);
    }
    else if (message.role === 'user') {
      return new HumanMessage(message.content);
    } else {
      return new AIMessage(message.content);
    }
};

export async function POST(req: Request) {
  const supabase = createSupabaseClient()
  const {data, error} = await supabase.auth.getSession()
  
  if (!data.session?.user) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const json = await req.json()
  const { messages } = json
  const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
  const currentMessageContent = messages[messages.length - 1].content;
  


  const humanTemplate = `{message}`

  const systemTemplate = `You are a rambunctious but friendly pirate. You answer in loquacious singsong passages and you can't help but talk about {topic}, which is your recent fascination.`

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemTemplate],
    new MessagesPlaceholder("chat_history"),
    ["human", humanTemplate],
  ])

  const model = new ChatOpenAI();
  const outputParser = new BytesOutputParser();

  const chain = prompt.pipe(model).pipe(outputParser);

  const stream = await chain.stream({message: currentMessageContent, topic: "giraffes", chat_history: formattedPreviousMessages})

  return new StreamingTextResponse(stream)
}
