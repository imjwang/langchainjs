import { 
  SimpleChatModel,
  type BaseChatModelParams
} from "langchain/chat_models/base"

import { AIMessageChunk, ChatGenerationChunk, type BaseMessage, AIMessage, HumanMessage, SystemMessage } from "langchain/schema";

import { CallbackManagerForLLMRun } from "langchain/callbacks";

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AWSBedrockAnthropicStream, StreamingTextResponse } from 'ai';
// import { experimental_buildAnthropicPrompt } from 'ai/prompts';
import { convertMessagesToPromptAnthropic } from "langchain/chat_models/bedrock"


export interface BedrockAnthropicChatModelInput extends BaseChatModelParams {
  model: string;
  region: string;
  credentials: {
    accessKeyId: string,
    secretAccessKey: string,
  }
}

export class BedrockAnthropicChat extends SimpleChatModel {
  model: string;
  region: string;
  credentials: {
    accessKeyId: string,
    secretAccessKey: string,
  }

  constructor(fields: BedrockAnthropicChatModelInput) {
    super(fields);
    this.model = fields.model;
    this.region = fields.region;
    this.credentials = fields.credentials;
  }

  _llmType() {
    return "BedrockAnthropicChat";
  }

  async _call(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    if (!messages.length) {
      throw new Error("No messages provided.");
    }
    if (typeof messages[0].content !== "string") {
      throw new Error("Multimodal messages are not supported.");
    }
    return messages[0].content;
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    if (!messages.length) {
      throw new Error("No messages provided.");
    }
    if (typeof messages[0].content !== "string") {
      throw new Error("Multimodal messages are not supported.");
    }

    const bedrockClient = new BedrockRuntimeClient({
      region: this.region,
      credentials: this.credentials
    });

    const response = await bedrockClient.send(
      new InvokeModelWithResponseStreamCommand({
        modelId: this.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          prompt: convertMessagesToPromptAnthropic(messages),
          max_tokens_to_sample: 300,
        }),
      }),
    );

    const decoder = new TextDecoder();
    for await (const chunk of response.body ?? []) {
      const bytes = chunk.chunk?.bytes;
  
      if (bytes != null) {
        const chunkText = decoder.decode(bytes);
        const chunkJSON = JSON.parse(chunkText);
        const delta = chunkJSON?.completion;
  
        if (delta != null) {
          yield new ChatGenerationChunk({
            message: new AIMessageChunk({
              content: delta,
            }),
            text: delta,
          });
          await runManager?.handleLLMNewToken(delta);
        }
      }
    }

    

    // const somethingStream = AWSBedrockAnthropicStream(response)

    // for await (const chunk of somethingStream) {

    // }


  }

  _combineLLMOutput() {
    return {};
  }
}

