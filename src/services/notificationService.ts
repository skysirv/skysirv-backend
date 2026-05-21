import nodemailer from "nodemailer"
import { env } from "../config/env.js"
import { canReceiveAlert } from "./entitlements.js"

type SendAlertEmailInput = {
  userId: string
  to: string
  airline: string
  airlineName?: string | null
  flightNumber?: string | null
  price: number
  currency: string
  routeHash: string
  origin?: string | null
  destination?: string | null
  departureDate?: string | Date | null
  alertType?: string | null
  thresholdValue?: number | string | null
  direction?: string | null
  dashboardUrl?: string | null
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
})

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDepartureDate(value?: string | Date | null): string | null {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function formatAlertRule(
  alertType?: string | null,
  direction?: string | null,
  thresholdValue?: number | string | null,
  currency = "USD"
): string {
  const threshold =
    thresholdValue !== null && thresholdValue !== undefined
      ? Number(thresholdValue)
      : null

  if (
    alertType === "absolute" &&
    direction &&
    threshold !== null &&
    Number.isFinite(threshold)
  ) {
    return `${direction === "below" ? "Below" : "Above"} ${formatMoney(
      threshold,
      currency
    )}`
  }

  if (
    (alertType === "percentage" || alertType === "pct_drop_milestone") &&
    threshold !== null &&
    Number.isFinite(threshold)
  ) {
    return `${threshold}% fare drop milestone`
  }

  return "Price alert"
}

export async function sendAlertEmail({
  userId,
  to,
  airline,
  airlineName,
  flightNumber,
  price,
  currency,
  routeHash,
  origin,
  destination,
  departureDate,
  alertType,
  thresholdValue,
  direction,
  dashboardUrl
}: SendAlertEmailInput): Promise<void> {

  const allowed = await canReceiveAlert(userId)

  if (!allowed) {
    console.log("🚫 Subscription limit reached. Email blocked.")
    return
  }

  const finalDashboardUrl =
    dashboardUrl || `${env.FRONTEND_BASE_URL}/?signin=1`
  const routeLabel =
    origin && destination ? `${origin} → ${destination}` : routeHash
  const airlineLabel = airlineName || airline
  const departureLabel = formatDepartureDate(departureDate)
  const alertRule = formatAlertRule(alertType, direction, thresholdValue, currency)
  const priceLabel = formatMoney(price, currency)

  await transporter.sendMail({
    from: `"Skysirv Alerts" <${env.EMAIL_USER}>`,
    to,
    subject: `✈️ Price Alert Triggered`,
    html: `
  <div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:28px;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
        <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#0284c7;font-weight:700;">
          Skysirv Price Alert
        </p>

        <h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;color:#020617;">
          A watched fare just triggered your alert.
        </h1>

        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
          Skysirv found a fare that matches your alert settings. Review the route in your dashboard before the fare changes.
        </p>

        <div style="border:1px solid #e2e8f0;border-radius:18px;padding:18px;background:#f8fafc;margin-bottom:22px;">
          <p style="margin:0 0 10px;font-size:15px;">
            <strong>Route:</strong> ${escapeHtml(routeLabel)}
          </p>

          ${departureLabel
        ? `<p style="margin:0 0 10px;font-size:15px;"><strong>Departure:</strong> ${escapeHtml(
          departureLabel
        )}</p>`
        : ""
      }

          <p style="margin:0 0 10px;font-size:15px;">
            <strong>Airline:</strong> ${escapeHtml(airlineLabel)}
          </p>

          ${flightNumber
        ? `<p style="margin:0 0 10px;font-size:15px;"><strong>Flight:</strong> ${escapeHtml(
          flightNumber
        )}</p>`
        : ""
      }

          <p style="margin:0 0 10px;font-size:15px;">
            <strong>Triggered price:</strong> ${escapeHtml(priceLabel)}
          </p>

          <p style="margin:0;font-size:15px;">
            <strong>Alert rule:</strong> ${escapeHtml(alertRule)}
          </p>
        </div>

        <a href="${finalDashboardUrl}" style="display:inline-block;background:#020617;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:14px;font-weight:700;">
          Go to dashboard
        </a>

        <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
          Fare availability can change quickly. Your dashboard has the latest watched-route context and recommendations.
        </p>
      </div>

      <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
        Skysirv AI Flight Intelligence
      </p>
    </div>
  </div>
`,
  })
}