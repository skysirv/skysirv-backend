import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.EMAIL_FROM || "Skysirv <support@skysirv.com>"

export async function sendInviteEmail(email: string, inviteLink: string) {

  try {

    const response = await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Your Skysirv Invite ✈️",
      html: `
        <h2>You're invited to Skysirv</h2>

        <p>You’ve been granted <b>Pro Lifetime Access</b>.</p>

        <p>Click below to activate your account:</p>

        <a href="${inviteLink}" 
           style="background:#004f94;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">
           Activate Account
        </a>

        <p style="margin-top:20px;color:#666;font-size:12px">
        Skysirv Travel Intelligence Platform
        </p>
      `
    })

    console.log("📨 Invite email sent:", response)

  } catch (error) {

    console.error("Invite email error:", error)

  }
}

export async function sendVerificationEmail(email: string, verifyLink: string) {

  try {

    const response = await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Activate your Skysirv account ✈️",
      html: `
        <h2>Welcome to Skysirv</h2>

        <p>You’re one step away from unlocking airfare intelligence.</p>

        <p>Click below to activate your account:</p>

        <a href="${verifyLink}" 
           style="background:#004f94;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">
           Activate Account
        </a>

        <p style="margin-top:20px;color:#666;font-size:12px">
        If you did not create this account, you can ignore this email.
        </p>
      `
    })

    console.log("📨 Verification email sent:", response)

  } catch (error) {

    console.error("Verification email error:", error)

  }
}

export async function sendFeedbackResponseEmail(
  email: string,
  message: string
) {
  try {
    const response = await resend.emails.send({
      from: FROM,
      to: email,
      subject: "A note from Skysirv ✈️",
      html: `
        <h2>Thank you for your feedback</h2>

        <p>We reviewed your message and wanted to respond personally.</p>

        <div style="margin:20px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;line-height:1.6;">
          ${message.replace(/\n/g, "<br />")}
        </div>

        <p style="margin-top:20px;color:#475569;font-size:14px">
          Thank you for helping us improve Skysirv during beta.
        </p>

        <p style="margin-top:20px;color:#64748b;font-size:12px">
          Skysirv Travel Intelligence Platform
        </p>
      `
    })

    console.log("📨 Feedback response email sent:", response)
  } catch (error) {
    console.error("Feedback response email error:", error)
    throw error
  }
}

export async function sendAdminActivityAlertEmail(message: string) {
  const adminEmail = "skysirv@gmail.com"

  try {
    const response = await resend.emails.send({
      from: FROM,
      to: adminEmail,
      subject: "New Skysirv Admin Activity",
      html: `
        <h2>New Skysirv Activity</h2>

        <p>A new platform activity event was recorded:</p>

        <div style="margin:20px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;line-height:1.6;">
          ${message.replace(/\n/g, "<br />")}
        </div>

        <p style="margin-top:20px;color:#64748b;font-size:12px">
          Skysirv Admin Activity Alert
        </p>
      `
    })

    console.log("📨 Admin activity alert email sent:", response)
  } catch (error) {
    console.error("Admin activity alert email error:", error)
  }
}