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
  isTaxable: boolean;
  taxAmount: number;
  totalAmount: number;
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
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  
  <style>
    /* Reset and Base Styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #f5f6fa;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    /* Mobile First: Base styles for mobile */
    .wrapper {
      width: 100%;
      background-color: #f5f6fa;
      padding: 20px 0;
    }
    
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 0;
      overflow: hidden;
    }
    
    /* Header */
    .header {
      background: linear-gradient(135deg, ${
        config.preferredWebsite.emailColor || '#667eea'
      } 0%, ${config.preferredWebsite.emailColor || '#764ba2'} 100%);
      padding: 30px 20px;
      text-align: center;
    }
    
    .logo {
      display: inline-block;
      max-width: 140px;
      height: auto;
      margin-bottom: 15px;
    }
    
    .header-title {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 5px;
      letter-spacing: -0.5px;
    }
    
    .header-subtitle {
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
      font-weight: 400;
    }
    
    /* Content Container */
    .content {
      padding: 30px 20px;
    }
    
    /* Greeting Section */
    .greeting {
      font-size: 18px;
      color: #1a1a1a;
      margin-bottom: 20px;
      font-weight: 500;
    }
    
    .greeting-name {
      color: ${config.preferredWebsite.emailColor || '#667eea'};
      font-weight: 600;
    }
    
    /* Thank You Card */
    .thank-you-card {
      background: #f8f9ff;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
      border-left: 4px solid ${config.preferredWebsite.emailColor || '#667eea'};
    }
    
    .thank-you-title {
      font-size: 20px;
      color: #1a1a1a;
      font-weight: 700;
      margin-bottom: 8px;
    }
    
    .thank-you-text {
      font-size: 14px;
      color: #4a5568;
      line-height: 1.6;
    }
    
    /* Amount Display */
    .amount-container {
      background: #ffffff;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px 20px;
      text-align: center;
      margin-bottom: 25px;
    }
    
    .amount-label {
      font-size: 12px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    .amount-value {
      font-size: 32px;
      font-weight: 700;
      color: #10b981;
      margin-bottom: 5px;
    }
    
    .amount-date {
      font-size: 13px;
      color: #718096;
    }
    
    /* Details Section */
    .details-section {
      background: #fafbfc;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
    }
    
    .details-title {
      font-size: 16px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .detail-item {
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .detail-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    
    .detail-label {
      font-size: 13px;
      color: #718096;
      margin-bottom: 4px;
      display: block;
    }
    
    .detail-value {
      font-size: 15px;
      color: #1a1a1a;
      font-weight: 600;
      display: block;
    }
    
    /* Special Message */
    .message-box {
      background: #fef3c7;
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 25px;
      border-left: 4px solid #f59e0b;
    }
    
    .message-label {
      font-size: 13px;
      font-weight: 600;
      color: #92400e;
      margin-bottom: 8px;
    }
    
    .message-text {
      font-size: 14px;
      color: #78350f;
      font-style: italic;
    }
    
    /* Tax Info */
    .tax-info {
      background: #ecfdf5;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
      border: 1px solid #86efac;
    }
    
    .tax-info-title {
      font-size: 15px;
      font-weight: 700;
      color: #14532d;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .tax-info-text {
      font-size: 13px;
      color: #166534;
      line-height: 1.6;
      margin-bottom: 5px;
    }
    
    /* CTA Button */
    .cta-container {
      text-align: center;
      margin: 30px 0;
    }
    
    .cta-button {
      display: inline-block;
      background: ${config.preferredWebsite.buttonColor || '#667eea'};
      color: #ffffff;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      transition: all 0.3s ease;
    }
    
    .cta-button:hover {
      background: ${
        config.preferredWebsite.buttonColor
          ? `${config.preferredWebsite.buttonColor}dd`
          : '#5a67d8'
      };
    }
    
    .cta-helper {
      font-size: 13px;
      color: #718096;
      margin-top: 12px;
    }
    
    /* Footer */
    .footer {
      background: #f7fafc;
      padding: 30px 20px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    
    .footer-logo {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 8px;
    }
    
    .footer-tagline {
      font-size: 13px;
      color: #718096;
      margin-bottom: 15px;
    }
    
    .footer-contact {
      font-size: 13px;
      color: #4a5568;
      margin-bottom: 15px;
    }
    
    .footer-link {
      color: ${config.preferredWebsite.emailColor || '#667eea'};
      text-decoration: none;
      font-weight: 500;
    }
    
    .footer-link:hover {
      text-decoration: underline;
    }
    
    .footer-legal {
      font-size: 11px;
      color: #a0aec0;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
    }
    
    /* Tablet and Desktop Styles */
    @media screen and (min-width: 480px) {
      .wrapper {
        padding: 40px 20px;
      }
      
      .container {
        border-radius: 16px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
      }
      
      .header {
        padding: 40px 30px;
      }
      
      .logo {
        max-width: 160px;
      }
      
      .header-title {
        font-size: 28px;
      }
      
      .header-subtitle {
        font-size: 16px;
      }
      
      .content {
        padding: 40px 30px;
      }
      
      .amount-value {
        font-size: 36px;
      }
      
      .detail-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .detail-label {
        margin-bottom: 0;
      }
      
      .cta-button {
        padding: 16px 40px;
        font-size: 16px;
      }
    }
    
    @media screen and (min-width: 600px) {
      .content {
        padding: 40px;
      }
      
      .header {
        padding: 50px 40px;
      }
      
      .header-title {
        font-size: 32px;
      }
      
      .amount-value {
        font-size: 42px;
      }
      
      .footer {
        padding: 40px;
      }
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a202c;
      }
      
      .container {
        background-color: #2d3748;
      }
      
      .header-title,
      .header-subtitle {
        color: #ffffff;
      }
      
      .greeting,
      .thank-you-title,
      .details-title,
      .detail-value,
      .footer-logo {
        color: #f7fafc;
      }
      
      .thank-you-text,
      .detail-label,
      .footer-tagline,
      .footer-contact,
      .cta-helper {
        color: #cbd5e0;
      }
      
      .thank-you-card,
      .details-section {
        background: #374151;
      }
      
      .amount-container {
        background: #374151;
        border-color: #4b5563;
      }
      
      .detail-item {
        border-color: #4b5563;
      }
      
      .footer {
        background: #2d3748;
        border-color: #4b5563;
      }
    }
    
    /* Print styles */
    @media print {
      body {
        background: white;
      }
      
      .cta-button {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <img src="cid:${logoCid}" alt="${
    config.preferredWebsite.name
  }" class="logo">
        <h1 class="header-title">Donation Receipt</h1>
        <p class="header-subtitle">Thank you for your generosity</p>
      </div>
      
      <!-- Main Content -->
      <div class="content">
        <!-- Greeting -->
        <div class="greeting">
          Hello <span class="greeting-name">${data.donorName}</span>,
        </div>
        
        <!-- Thank You Message -->
        <div class="thank-you-card">
          <h2 class="thank-you-title">Thank You for Your Support!</h2>
          <p class="thank-you-text">
            Your generous donation to ${
              data.organizationName
            } helps us continue our mission 
            and create meaningful impact in our community. We are deeply grateful for your support.
          </p>
        </div>
        
        <!-- Amount Display -->
        <div class="amount-container">
          <div class="amount-label">Donation Amount</div>
          <div class="amount-value">${data.currency} ${data.amount.toFixed(
    2
  )}</div>
          <div class="amount-date">${formattedDate}</div>
        </div>
        
        <!-- Transaction Details -->
        <div class="details-section">
          <h3 class="details-title">
            <span>📋</span> Transaction Details
          </h3>
          
          <div class="detail-item">
            <span class="detail-label">Receipt Number</span>
            <span class="detail-value">${data.receiptNumber}</span>
          </div>
          
          <div class="detail-item">
            <span class="detail-label">Organization</span>
            <span class="detail-value">${data.organizationName}</span>
          </div>
          
          <div class="detail-item">
            <span class="detail-label">Donation Type</span>
            <span class="detail-value">${formatDonationType(
              data.donationType
            )}</span>
          </div>
          
          ${
            data.isTaxable
              ? `
          <div class="detail-item">
            <span class="detail-label">Tax Amount</span>
            <span class="detail-value">${
              data.currency
            } ${data.taxAmount.toFixed(2)}</span>
          </div>
          `
              : ''
          }
          
          <div class="detail-item">
            <span class="detail-label">Total Amount</span>
            <span class="detail-value" style="color: #10b981; font-size: 16px;">
              ${data.currency} ${data.totalAmount.toFixed(2)}
            </span>
          </div>
        </div>
        
        ${
          data.specialMessage
            ? `
        <!-- Special Message -->
        <div class="message-box">
          <div class="message-label">📝 Your Message</div>
          <div class="message-text">"${data.specialMessage}"</div>
        </div>
        `
            : ''
        }
        
        <!-- Tax Information -->
        <div class="tax-info">
          <h4 class="tax-info-title">
            <span>💼</span> Tax Information
          </h4>
          <p class="tax-info-text">
            This receipt serves as official documentation for tax purposes.
          </p>
          <p class="tax-info-text">
            ${
              data.isTaxable
                ? 'This donation may be eligible for tax deduction.'
                : 'Please consult your tax advisor regarding deductibility.'
            }
          </p>
        </div>
        
        <!-- CTA Button -->
        <div class="cta-container">
          <a href="${data.pdfUrl}" class="cta-button">
            📥 Download PDF Receipt
          </a>
          <p class="cta-helper">Save this receipt for your records</p>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <div class="footer-logo">${config.preferredWebsite.name}</div>
        <p class="footer-tagline">Making a difference together</p>
        <p class="footer-contact">
          Questions? Contact us at 
          <a href="mailto:${config.email.contactUsEmail}" class="footer-link">
            ${config.email.contactUsEmail}
          </a>
        </p>
        <div class="footer-legal">
          <p>This is an automated email. Please do not reply directly.</p>
          <p>© ${new Date().getFullYear()} ${
    config.preferredWebsite.name
  }. All rights reserved.</p>
        </div>
      </div>
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
