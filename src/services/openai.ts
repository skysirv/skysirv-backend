import OpenAI from "openai"
import { env } from "../config/env.js"

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
})

export function getOpenAIChatModel() {
  return env.OPENAI_CHAT_MODEL
}

export function getOpenAIIntelligenceModel() {
  return env.OPENAI_INTELLIGENCE_MODEL
}