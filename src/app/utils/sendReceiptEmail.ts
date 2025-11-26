import httpStatus from 'http-status';
import nodemailer from 'nodemailer';
import config from '../config';
import AppError from './AppError';
import path from 'path';

export interface IReceiptEmailPayload {
  donorEmail: string;
  donorName: string;
  organizationName: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  donationDate: Date;
  pdfUrl: string;
  donationType?: string;
  specialMessage?: string;
}

// Generate Receipt Email HTML Template
const generateReceiptEmailHTML = (
  data: IReceiptEmailPayload,
  logoCid: string
) => {
  const formattedDate = new Date(data.donationDate).toLocaleDateString(
    'en-US',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }
  );

  const formatDonationType = (type?: string) => {
    if (!type) return 'One-Time';
    const typeMap: Record<string, string> = {
      'one-time': 'One-Time',
      recurring: 'Recurring',
      'round-up': 'Round-Up',
    };
    return typeMap[type] || type;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f7f9fc;
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }
    .container {
      width: 100%;
      max-width: 650px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 40px;
      border-radius: 15px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      padding-bottom: 30px;
      border-bottom: 3px solid ${
        config.preferredWebsite.emailColor || '#3498DB'
      };
    }
    .header img {
      max-width: 180px;
      margin-bottom: 20px;
    }
    .header h1 {
      color: ${config.preferredWebsite.emailColor || '#3498DB'};
      font-size: 32px;
      margin: 10px 0;
      font-weight: bold;
    }
    .header p {
      color: #7F8C8D;
      font-size: 16px;
    }
    .greeting {
      font-size: 18px;
      color: #2C3E50;
      margin: 30px 0 20px;
    }
    .thank-you {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 25px;
      border-radius: 10px;
      text-align: center;
      margin: 25px 0;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }
    .thank-you h2 {
      margin: 0 0 10px;
      font-size: 24px;
    }
    .thank-you p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .donation-details {
      background-color: #f8f9fa;
      border-left: 5px solid ${config.preferredWebsite.emailColor || '#3498DB'};
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .donation-details h3 {
      color: #2C3E50;
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 20px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: #7F8C8D;
      font-weight: 500;
    }
    .detail-value {
      color: #2C3E50;
      font-weight: 600;
    }
    .amount-highlight {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      margin: 25px 0;
      box-shadow: 0 4px 15px rgba(17, 153, 142, 0.3);
    }
    .amount-highlight .amount {
      font-size: 36px;
      font-weight: bold;
      margin: 10px 0;
    }
    .amount-highlight .label {
      font-size: 14px;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .download-button {
      display: inline-block;
      background: ${config.preferredWebsite.buttonColor || '#3498DB'};
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 50px;
      font-size: 16px;
      font-weight: bold;
      margin: 25px 0;
      box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
      transition: all 0.3s ease;
      text-align: center;
    }
    .download-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(52, 152, 219, 0.4);
    }
    .special-message {
      background-color: #FFF8E1;
      border-left: 5px solid #FFC107;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
      font-style: italic;
      color: #856404;
    }
    .tax-info {
      background-color: #E8F5E9;
      border: 1px solid #4CAF50;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .tax-info h4 {
      color: #2E7D32;
      margin-top: 0;
      margin-bottom: 10px;
    }
    .tax-info p {
      color: #1B5E20;
      margin: 5px 0;
      font-size: 14px;
    }
    .footer {
      text-align: center;
      font-size: 13px;
      color: #95a5a6;
      padding-top: 30px;
      border-top: 2px solid #ecf0f1;
      margin-top: 40px;
    }
    .footer p {
      margin: 5px 0;
    }
    .footer a {
      color: ${config.preferredWebsite.emailColor || '#3498DB'};
      text-decoration: none;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    @media only screen and (max-width: 600px) {
      .container {
        padding: 20px;
      }
      .header h1 {
        font-size: 26px;
      }
      .amount-highlight .amount {
        font-size: 28px;
      }
      .download-button {
        padding: 12px 30px;
        font-size: 14px;
      }
      .detail-row {
        flex-direction: column;
      }
      .detail-value {
        margin-top: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <img src="cid:${logoCid}" alt="${config.preferredWebsite.name} Logo">
      <h1>🎉 Thank You for Your Donation!</h1>
      <p>Your generosity makes a difference</p>
    </div>

    <!-- Greeting -->
    <p class="greeting">Dear ${data.donorName},</p>

    <!-- Thank You Message -->
    <div class="thank-you">
      <h2>Your Kindness Changes Lives</h2>
      <p>Thank you for supporting ${
        data.organizationName
      }. Your contribution helps us continue our mission and make a positive impact.</p>
    </div>

    <!-- Amount Highlight -->
    <div class="amount-highlight">
      <div class="label">Donation Amount</div>
      <div class="amount">${data.currency} ${data.amount.toFixed(2)}</div>
      <div class="label">Received on ${formattedDate}</div>
    </div>

    <!-- Donation Details -->
    <div class="donation-details">
      <h3>📋 Donation Details</h3>
      <div class="detail-row">
        <span class="detail-label">Receipt Number:</span>
        <span class="detail-value">${data.receiptNumber}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Organization:</span>
        <span class="detail-value">${data.organizationName}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Donation Type:</span>
        <span class="detail-value">${formatDonationType(
          data.donationType
        )}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${formattedDate}</span>
      </div>
    </div>

    ${
      data.specialMessage
        ? `
    <div class="special-message">
      <strong>📝 Your Message:</strong><br>
      "${data.specialMessage}"
    </div>
    `
        : ''
    }

    <!-- Tax Information -->
    <div class="tax-info">
      <h4>💼 Tax Deduction Information</h4>
      <p>This receipt is for tax purposes. Please retain it for your records.</p>
      <p>This donation may be tax-deductible. Consult with your tax advisor for specific guidance.</p>
    </div>

    <!-- Download Button -->
    <div class="button-container">
      <a href="${data.pdfUrl}" class="download-button">
        📥 Download Receipt PDF
      </a>
    </div>

    <p style="text-align: center; color: #7F8C8D; font-size: 14px; margin-top: 20px;">
      Click the button above to download your official receipt PDF for your tax records.
    </p>

    <!-- Footer -->
    <div class="footer">
      <p><strong>${config.preferredWebsite.name}</strong></p>
      <p>Empowering change, one donation at a time 🌙</p>
      <p>
        If you have any questions, please contact us at 
        <a href="mailto:${config.email.contactUsEmail}">${
    config.email.contactUsEmail
  }</a>
      </p>
      <p style="margin-top: 15px; font-size: 11px;">
        This is an automated email. Please do not reply directly to this message.
      </p>
      <p style="color: #bdc3c7;">
        © ${new Date().getFullYear()} ${
    config.preferredWebsite.name
  }. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * Send Receipt Email to Donor
 */
const sendReceiptEmail = async (
  payload: IReceiptEmailPayload
): Promise<void> => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email.nodemailerEmail,
        pass: config.email.nodemailerPassword,
      },
    });

    const logoCid = 'crescent_change_logo';
    const htmlTemplate = generateReceiptEmailHTML(payload, logoCid);

    // Email options
    const mailOptions = {
      from: `${config.preferredWebsite.name} 🌙 <${config.email.nodemailerEmail}>`,
      to: payload.donorEmail,
      subject: `🎁 Your Donation Receipt from ${payload.organizationName} - ${payload.receiptNumber}`,
      html: htmlTemplate,
      attachments: [
        {
          filename: 'logo.png',
          path: path.join(__dirname, 'assets', 'logo.png'),
          cid: logoCid,
        },
      ],
    };

    // Send email
    await transporter.sendMail(mailOptions);
    console.log(`✅ Receipt email sent to: ${payload.donorEmail}`);
  } catch (error) {
    console.error('❌ Failed to send receipt email:', error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to send receipt email: ${(error as Error).message}`
    );
  }
};

export default sendReceiptEmail;
