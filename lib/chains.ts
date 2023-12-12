"use server"

import { Message } from 'ai';
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { RunnableSequence } from "langchain/schema/runnable";


export async function getSaveObject(messages: Message[]) {
  const parser = StructuredOutputParser.fromNamesAndDescriptions({
    title: "summary of conversation, should be a short sentence.",
    topic: "topic of conversation, should be one word.",
    color: "give the conversation a color depending on the contents, should be a hex color code.",
    emotion: "emotional summary of the conversation, should be a series of 3 emojis.",
  });
  
  const chain = RunnableSequence.from([
    {
      parseInstructions: () => parser.getFormatInstructions(),
      messages: (input: {messages: Message[]}) => {
        return input.messages?.map(({role, content}) => `${role}: ${content}`).join("\n");
      },
    }
    ,
    PromptTemplate.fromTemplate(
      "Please analyze the following conversation:\n{messages}\n{parseInstructions}"
    ),
    new ChatOpenAI(),
    parser,
  ]);
    
  const response = await chain.invoke({
    messages,
  });
  
  return response;
}
