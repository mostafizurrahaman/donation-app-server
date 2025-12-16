import nodemailer from 'nodemailer';
import config from '../config';

interface IReceiptEmailData {
  to: string;
  donorName: string;
  organizationName: string;
  receiptUrl: string;
  receiptNumber: string;
  donationAmount: number;
  donationDate: Date;
}

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // Using Gmail service
    auth: {
      user: config.email.nodemailerEmail,
      pass: config.email.nodemailerPassword,
    },
  });
};

// Send receipt email
export const sendReceiptEmail = async (
  data: IReceiptEmailData
): Promise<void> => {
  try {
    const transporter = createTransporter();

    const formattedAmount = new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'usd',
    }).format(data.donationAmount);

    const formattedDate = data.donationDate.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Donation Receipt</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
              }
              .header {
                  text-align: center;
                  background-color: #2c5530;
                  color: white;
                  padding: 30px 20px;
                  border-radius: 8px 8px 0 0;
              }
              .logo {
                  font-size: 24px;
                  font-weight: bold;
                  margin-bottom: 10px;
              }
              .content {
                  background-color: #f8f9fa;
                  padding: 30px;
                  border-radius: 0 0 8px 8px;
              }
              .greeting {
                  font-size: 18px;
                  margin-bottom: 20px;
                  color: #2c5530;
              }
              .donation-details {
                  background-color: white;
                  padding: 20px;
                  border-radius: 6px;
                  margin: 20px 0;
                  border-left: 4px solid #2c5530;
              }
              .detail-row {
                  display: flex;
                  justify-content: space-between;
                  margin-bottom: 10px;
                  padding: 5px 0;
              }
              .detail-label {
                  font-weight: bold;
                  color: #495057;
              }
              .detail-value {
                  color: #212529;
              }
              .amount {
                  font-size: 20px;
                  font-weight: bold;
                  color: #2c5530;
              }
              .download-button {
                  display: inline-block;
                  background-color: #2c5530;
                  color: white;
                  padding: 12px 24px;
                  text-decoration: none;
                  border-radius: 6px;
                  margin: 20px 0;
                  font-weight: bold;
              }
              .footer {
                  text-align: center;
                  margin-top: 30px;
                  padding-top: 20px;
                  border-top: 1px solid #dee2e6;
                  font-size: 14px;
                  color: #6c757d;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <div class="logo">🌙 Crescent Change</div>
              <div>Thank you for your generous donation!</div>
          </div>
          
          <div class="content">
              <div class="greeting">Dear ${data.donorName},</div>
              
              <p>Thank you for your generous donation to <strong>${
                data.organizationName
              }</strong>. Your contribution makes a real difference in our community.</p>
              
              <div class="donation-details">
                  <div class="detail-row">
                      <span class="detail-label">Receipt Number:</span>
                      <span class="detail-value">${data.receiptNumber}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Organization:</span>
                      <span class="detail-value">${data.organizationName}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Donation Date:</span>
                      <span class="detail-value">${formattedDate}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Amount:</span>
                      <span class="detail-value amount">${formattedAmount}</span>
                  </div>
              </div>
              
              <p>You can download your official receipt using the link below:</p>
              
              <a href="${process.env.BASE_URL || 'http://localhost:3000'}${
      data.receiptUrl
    }" class="download-button">
                  Download Receipt
              </a>
              
              <p>Please keep this receipt for your records. If you have any questions about your donation, please don't hesitate to contact us.</p>
              
              <p>With gratitude,<br>The Crescent Change Team</p>
          </div>
          
          <div class="footer">
              <p>Crescent Change - Connecting Hearts, Changing Lives</p>
              <p>This is an automated email. Please do not reply to this message.</p>
          </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"Crescent Change" <${config.email.nodemailerEmail}>`,
      to: data.to,
      subject: `Your Donation Receipt - ${data.receiptNumber}`,
      html: emailHTML,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new Error(
      `Failed to send receipt email: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};

// Send welcome email for new users
export const sendWelcomeEmail = async (
  to: string,
  name: string
): Promise<void> => {
  try {
    const transporter = createTransporter();

    const emailHTML = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Welcome to Crescent Change</title>
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { text-align: center; background-color: #2c5530; color: white; padding: 30px; border-radius: 8px; }
              .content { padding: 30px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🌙 Welcome to Crescent Change</h1>
              </div>
              <div class="content">
                  <h2>Dear ${name},</h2>
                  <p>Welcome to Crescent Change! We're excited to have you join our community of changemakers.</p>
                  <p>With Crescent Change, you can:</p>
                  <ul>
                      <li>Make one-time donations to verified organizations</li>
                      <li>Set up round-up donations to automatically donate spare change</li>
                      <li>Earn rewards for your generous contributions</li>
                      <li>Track your donation history and receipts</li>
                  </ul>
                  <p>Thank you for choosing to make a difference!</p>
                  <p>Best regards,<br>The Crescent Change Team</p>
              </div>
          </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"Crescent Change" <${config.email.nodemailerEmail}>`,
      to,
      subject: 'Welcome to Crescent Change!',
      html: emailHTML,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new Error(
      `Failed to send welcome email: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
};
