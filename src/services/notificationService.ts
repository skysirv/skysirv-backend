import nodemailer from "nodemailer"
import { env } from "../config/env.js"
import { canReceiveAlert } from "./entitlements.js"

type SendAlertEmailInput = {
  userId: string
  to: string
  airline: string
  price: number
  currency: string
  routeHash: string
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
})

export async function sendAlertEmail({
  userId,
  to,
  airline,
  price,
  currency,
  routeHash,
}: SendAlertEmailInput): Promise<void> {

  const allowed = await canReceiveAlert(userId)

  if (!allowed) {
    console.log("🚫 Subscription limit reached. Email blocked.")
    return
  }

  await transporter.sendMail({
    from: `"Skysirv Alerts" <${env.EMAIL_USER}>`,
    to,
    subject: `✈️ Price Alert Triggered`,
    html: `
      <h2>Price Alert Triggered!</h2>
      <p><strong>Airline:</strong> ${airline}</p>
      <p><strong>Price:</strong> ${price} ${currency}</p>
      <p><strong>Route:</strong> ${routeHash}</p>
      <p>Book fast — this deal might not last.</p>
      <hr />
      <p>Skysirv AI Flight Intelligence</p>
    `,
  })
}