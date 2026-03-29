import Stripe from "stripe"
import { env } from "../config/env.js"

export const stripe = new Stripe(env.STRIPE_SECRET_KEY)
console.log("STRIPE KEY:", env.STRIPE_SECRET_KEY)